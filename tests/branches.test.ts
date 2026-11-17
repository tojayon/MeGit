import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture, git, commitFile } from './fixtures.js';
import { performAction, readRepository } from '../server/git.js';
import type { BranchAction, RepoState } from '../shared/types.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
async function setup(empty = false) {
  const f = await fixture();
  cleanups.push(f.cleanup);
  if (!empty) await commitFile(f.repo);
  return f;
}
const expected = (s: RepoState) => ({ branch: s.branch, head: s.head, detached: s.detached });
const create = (
  s: RepoState,
  name: string,
  checkout = false,
): Extract<BranchAction, { type: 'createBranch' }> => ({
  type: 'createBranch',
  name,
  startPoint: 'HEAD',
  startHash: s.head!,
  checkout,
  track: false,
  expected: expected(s),
});
const target = (
  s: RepoState,
  type: 'switchBranch' | 'deleteBranch',
  name: string,
): BranchAction => ({
  type,
  name,
  targetHash: s.branches.find((b) => !b.remote && b.name === name)!.hash,
  expected: expected(s),
});

describe('安全的本地分支管理（临时真实 Git 仓库）', () => {
  it('中文分支从当前提交创建、切换，再切回并安全删除', async () => {
    const { repo } = await setup();
    let s = await readRepository(repo);
    await performAction(repo, create(s, '功能/登录', true));
    s = await readRepository(repo);
    expect(s.branch).toBe('功能/登录');
    expect(s.branches.find((b) => b.name === '功能/登录')).toMatchObject({ current: true });
    await performAction(repo, target(s, 'switchBranch', 'main'));
    s = await readRepository(repo);
    await performAction(repo, target(s, 'deleteBranch', '功能/登录'));
    expect((await readRepository(repo)).branches.map((b) => b.name)).toEqual(['main']);
  });

  it('仅创建保留修改；未跟踪、已暂存及未暂存文件阻止切换', async () => {
    const { repo } = await setup();
    const s = await readRepository(repo);
    await writeFile(path.join(repo, 'draft.txt'), 'draft');
    await performAction(repo, create(s, 'feature'));
    for (const staged of [false, true]) {
      if (staged) await git(repo, 'add', 'draft.txt');
      const dirty = await readRepository(repo);
      await expect(
        performAction(repo, target(dirty, 'switchBranch', 'feature')),
      ).rejects.toMatchObject({ code: 'dirtyBranch', status: 409 });
      await expect(performAction(repo, create(dirty, 'blocked', true))).rejects.toMatchObject({
        code: 'dirtyBranch',
      });
    }
    expect(await readFile(path.join(repo, 'draft.txt'), 'utf8')).toBe('draft');
    expect((await readRepository(repo)).branch).toBe('main');
    expect(await git(repo, 'branch', '--list', 'blocked')).toBe('');
  });

  it('使用已缓存的远端分支创建本地跟踪分支而不联网', async () => {
    const { repo } = await setup();
    const s = await readRepository(repo);
    await git(repo, 'remote', 'add', 'origin', 'https://offline.invalid/repository.git');
    await git(repo, 'update-ref', 'refs/remotes/origin/功能', s.head!);
    await performAction(repo, {
      ...create(s, '本地/功能', true),
      startPoint: 'refs/remotes/origin/功能',
      track: true,
    });
    expect(await readRepository(repo)).toMatchObject({
      branch: '本地/功能',
      upstream: 'origin/功能',
      head: s.head,
    });
  });

  it('拒绝已变化的当前分支、HEAD 或目标提交', async () => {
    const { repo } = await setup();
    await git(repo, 'branch', 'feature');
    const old = await readRepository(repo);
    await commitFile(repo, 'next.txt');
    await expect(performAction(repo, create(old, 'stale'))).rejects.toMatchObject({
      code: 'branchStateChanged',
      status: 409,
    });
    const fresh = await readRepository(repo);
    await git(repo, 'branch', '-f', 'feature', fresh.head!);
    await expect(
      performAction(repo, { ...target(old, 'switchBranch', 'feature'), expected: expected(fresh) }),
    ).rejects.toMatchObject({ code: 'branchTargetChanged', status: 409 });
    await git(repo, 'switch', 'feature');
    await expect(performAction(repo, create(fresh, 'also-stale'))).rejects.toMatchObject({
      code: 'branchStateChanged',
    });
  });

  it('拒绝删除当前分支以及尚未并入当前 HEAD 的分支', async () => {
    const { repo } = await setup();
    await git(repo, 'switch', '-c', 'unmerged');
    await commitFile(repo, 'feature.txt');
    await git(repo, 'switch', 'main');
    const s = await readRepository(repo);
    await expect(performAction(repo, target(s, 'deleteBranch', 'main'))).rejects.toMatchObject({
      code: 'branchCurrent',
    });
    await expect(performAction(repo, target(s, 'deleteBranch', 'unmerged'))).rejects.toMatchObject({
      code: 'branchNotMerged',
    });
    expect((await readRepository(repo)).branches).toHaveLength(2);
  });

  it('识别并保护其他工作树正在使用的分支', async () => {
    const { repo, root } = await setup();
    await git(repo, 'worktree', 'add', '-b', 'occupied', path.join(root, 'other'));
    const s = await readRepository(repo);
    expect(s.branches.find((b) => b.name === 'occupied')?.inWorktree).toBe(true);
    for (const type of ['switchBranch', 'deleteBranch'] as const)
      await expect(performAction(repo, target(s, type, 'occupied'))).rejects.toMatchObject({
        code: 'branchInWorktree',
      });
  });

  it.each([
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherryPick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect'],
    ['rebase-merge', 'rebase'],
  ])('识别 %s 进行中状态并阻止分支动作', async (marker, operation) => {
    const { repo } = await setup();
    const before = await readRepository(repo);
    const markerPath = path.join(repo, '.git', marker);
    if (marker === 'rebase-merge') await mkdir(markerPath);
    else await writeFile(markerPath, before.head! + '\n');
    const s = await readRepository(repo);
    expect(s.operation).toBe(operation);
    await expect(performAction(repo, create(s, 'blocked'))).rejects.toMatchObject({
      code: 'branchOperation',
      status: 409,
    });
  });

  it('空仓库不伪造提交或分支', async () => {
    const { repo } = await setup(true);
    const s = await readRepository(repo);
    await expect(
      performAction(repo, { ...create(s, 'feature'), startHash: 'a'.repeat(40) }),
    ).rejects.toMatchObject({ code: 'branchNoCommits' });
    expect((await readRepository(repo)).head).toBeNull();
  });

  it('拒绝危险分支名、任意起点表达式、重复名及大小写别名', async () => {
    const { repo } = await setup();
    const s = await readRepository(repo);
    for (const name of [
      '-D',
      'HEAD',
      '@{-1}',
      'bad..name',
      'bad name',
      'a/.b',
      'a.lock',
      'x//y',
      'x~1',
      'x\\y',
    ])
      await expect(performAction(repo, create(s, name))).rejects.toMatchObject({
        code: 'branchName',
      });
    for (const startPoint of ['--help', 'HEAD~1', s.head!, 'refs/tags/main'])
      await expect(
        performAction(repo, { ...create(s, 'bad-start'), startPoint }),
      ).rejects.toMatchObject({ code: 'branchStartPoint' });
    for (const name of ['main', 'MAIN'])
      await expect(performAction(repo, create(s, name))).rejects.toMatchObject({
        code: 'branchExists',
      });
  });

  it('分支与标签同名时仍精确操作本地分支；忽略远端 HEAD 别名', async () => {
    const { repo } = await setup();
    await git(repo, 'tag', 'main');
    await git(repo, 'branch', 'feature', 'refs/heads/main');
    await git(repo, 'tag', 'feature', 'refs/heads/main');
    await git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    await git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    let s = await readRepository(repo);
    expect(s.branches.map((b) => b.name)).toEqual(expect.arrayContaining(['main', 'feature']));
    expect(s.branches.some((b) => b.name === 'origin/HEAD')).toBe(false);
    await performAction(repo, target(s, 'switchBranch', 'feature'));
    s = await readRepository(repo);
    expect(s.branch).toBe('feature');
    await performAction(repo, target(s, 'switchBranch', 'main'));
    await performAction(repo, target(await readRepository(repo), 'deleteBranch', 'feature'));
    expect(await git(repo, 'tag', '--list', 'feature')).toBe('feature');
  });

  it('串行重复提交只创建一次，前一个失败后队列仍可继续', async () => {
    const { repo } = await setup();
    const s = await readRepository(repo);
    const result = await Promise.allSettled([
      performAction(repo, create(s, 'once')),
      performAction(repo, create(s, 'once')),
    ]);
    expect(result.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    await performAction(repo, create(s, 'next'));
    expect((await readRepository(repo)).branches).toHaveLength(3);
  });

  it('脱离分支时能从当前提交建立分支，显式禁止自动继承跟踪配置', async () => {
    const { repo } = await setup();
    await git(repo, 'config', 'branch.autoSetupMerge', 'always');
    await git(repo, 'switch', '--detach');
    const s = await readRepository(repo);
    expect(s.detached).toBe(true);
    await performAction(repo, create(s, 'rescue', true));
    expect(await readRepository(repo)).toMatchObject({
      branch: 'rescue',
      detached: false,
      head: s.head,
      upstream: null,
    });
    await performAction(repo, {
      ...create(await readRepository(repo), 'no-tracking'),
      startPoint: 'refs/heads/main',
    });
    expect(await git(repo, 'config', '--get-regexp', '^branch\\.')).not.toContain('no-tracking');
  });

  it('远端起点已更新时拒绝创建；仅创建跟踪分支不改变当前工作区', async () => {
    const { repo } = await setup();
    await git(repo, 'remote', 'add', 'origin', 'https://offline.invalid/repository.git');
    const old = (await readRepository(repo)).head!;
    await git(repo, 'update-ref', 'refs/remotes/origin/feature', old);
    await commitFile(repo, 'new.txt');
    const s = await readRepository(repo);
    await git(repo, 'update-ref', 'refs/remotes/origin/feature', s.head!);
    await expect(
      performAction(repo, {
        ...create(s, 'stale'),
        startPoint: 'refs/remotes/origin/feature',
        startHash: old,
        track: true,
      }),
    ).rejects.toMatchObject({ code: 'branchTargetChanged' });
    await performAction(repo, {
      ...create(await readRepository(repo), 'tracking'),
      startPoint: 'refs/remotes/origin/feature',
      track: true,
    });
    expect((await readRepository(repo)).branch).toBe('main');
    expect(await git(repo, 'config', 'branch.tracking.remote')).toBe('origin');
    expect(await git(repo, 'config', 'branch.tracking.merge')).toBe('refs/heads/feature');
  });

  it('切换和创建后切换不覆盖被忽略的本机文件', async () => {
    const { repo } = await setup();
    await commitFile(repo, '.gitignore', 'local.env\n');
    await git(repo, 'switch', '-c', 'feature');
    await writeFile(path.join(repo, 'local.env'), 'tracked feature content');
    await git(repo, 'add', '-f', 'local.env');
    await git(repo, 'commit', '-m', 'Track fixture file');
    await git(repo, 'switch', 'main');
    await writeFile(path.join(repo, 'local.env'), 'private local content');
    const s = await readRepository(repo);
    expect(s.changed).toBe(0);
    await expect(performAction(repo, target(s, 'switchBranch', 'feature'))).rejects.toMatchObject({
      code: 'gitFailed',
    });
    expect(await readFile(path.join(repo, 'local.env'), 'utf8')).toBe('private local content');
    const featureHash = s.branches.find((b) => b.name === 'feature')!.hash;
    await expect(
      performAction(repo, {
        ...create(s, 'created-feature', true),
        startPoint: 'refs/heads/feature',
        startHash: featureHash,
      }),
    ).rejects.toMatchObject({ code: 'gitFailed' });
    expect((await readRepository(repo)).branch).toBe('main');
    expect(await readFile(path.join(repo, 'local.env'), 'utf8')).toBe('private local content');
    expect(await git(repo, 'branch', '--list', 'created-feature')).toBe('');
  });
});
