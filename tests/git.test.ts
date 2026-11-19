import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBranchTree } from '../server/branch-tree.js';
import { fixture, git, commitFile } from './fixtures.js';
import {
  resolveRepository,
  readRepository,
  getHistory,
  getDiff,
  inspectIntegration,
  performAction,
} from '../server/git.js';

const cleanups: Array<() => Promise<void>> = [];
async function setup() {
  const f = await fixture();
  cleanups.push(f.cleanup);
  return f;
}
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});

describe('本机 Git 投影', () => {
  it('浅克隆空父列表只表示历史边界，不确认为初始提交', async () => {
    const { repo, root } = await setup();
    await commitFile(repo, 'one.txt');
    const hash = await commitFile(repo, 'two.txt');
    const shallow = path.join(root, 'shallow');
    await git(root, 'clone', '--depth=1', pathToFileURL(repo).href, shallow);
    const history = await getHistory(shallow);
    expect(history[0]).toMatchObject({ hash, parents: [], rootUnconfirmed: true });
    const tree = await readBranchTree(shallow);
    expect(tree.commits.find((commit) => commit.hash === hash)?.rootUnconfirmed).toBe(true);
    expect((await getHistory(repo)).at(-1)?.rootUnconfirmed).toBeUndefined();
  });
  it('命令预览读取真实推送目标，不从上游显示名称猜测，拒绝本机及无效配置', async () => {
    const { repo, root } = await setup();
    const hash = await commitFile(repo);
    const remote = path.join(root, 'remote.git');
    await git(root, 'init', '--bare', remote);
    await git(repo, 'remote', 'add', 'team', remote);
    await git(repo, 'update-ref', 'refs/remotes/team/release/target', hash);
    await git(repo, 'config', 'branch.main.remote', 'team');
    await git(repo, 'config', 'branch.main.merge', 'refs/heads/release/target');
    expect((await readRepository(repo)).pushTarget).toEqual({
      remote: 'team',
      ref: 'refs/heads/release/target',
    });
    await git(repo, 'config', 'branch.main.remote', '.');
    expect((await readRepository(repo)).pushTarget).toBeNull();
    await git(repo, 'config', 'branch.main.remote', 'team');
    await git(repo, 'config', 'branch.main.merge', 'refs/tags/not-a-branch');
    expect((await readRepository(repo)).pushTarget).toBeNull();
    await git(repo, 'config', 'branch.main.merge', 'refs/heads/release/target');
    await git(repo, 'config', 'branch.main.remote', 'https://user:secret@example.invalid/repo.git');
    const state = await readRepository(repo);
    expect(state.pushTarget).toBeNull();
    expect(JSON.stringify(state)).not.toContain('secret');
  });
  it('识别空仓库，不伪造提交、跟踪分支或远端时间', async () => {
    const { repo } = await setup();
    const state = await readRepository(repo);
    expect(state.branch).toBe('main');
    expect(state.head).toBeNull();
    expect(state.upstream).toBeNull();
    expect(state.ahead).toBeNull();
    expect(state.fetchedAt).toBeNull();
    expect(await getHistory(repo)).toEqual([]);
  });

  it('规范化子目录并保留带空格和中文的工作区文件名', async () => {
    const { repo } = await setup();
    await commitFile(repo);
    await mkdir(path.join(repo, 'sub'));
    expect(await resolveRepository(path.join(repo, 'sub'))).toBe(repo.replaceAll('\\', '/'));
    await writeFile(path.join(repo, '笔记 example.txt'), 'changed\n');
    await writeFile(path.join(repo, '未跟踪 file.txt'), 'new\n');
    const state = await readRepository(repo);
    expect(state.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['笔记 example.txt', '未跟踪 file.txt']),
    );
    expect(state.changed).toBe(2);
    expect(state.staged).toBe(0);
    expect((await getDiff(repo, { path: '笔记 example.txt' })).text).toContain('+changed');
    expect((await getDiff(repo, { path: '未跟踪 file.txt' })).text).toContain('+new');
  });

  it('只暂存指定文件，提交后恢复干净状态，拒绝未登记文件参数', async () => {
    const { repo } = await setup();
    await writeFile(path.join(repo, '新文件.txt'), 'hello\n');
    await expect(
      performAction(repo, { type: 'stage', paths: ['../outside.txt'] }),
    ).rejects.toThrow();
    await performAction(repo, { type: 'stage', paths: ['新文件.txt'] });
    expect((await readRepository(repo)).staged).toBe(1);
    await performAction(repo, { type: 'unstage', paths: ['新文件.txt'] });
    expect((await readRepository(repo)).staged).toBe(0);
    await performAction(repo, { type: 'stage', paths: ['新文件.txt'] });
    await performAction(repo, { type: 'commit', message: '新增本地文档' });
    expect((await readRepository(repo)).changed).toBe(0);
    const log = await getHistory(repo);
    expect(log[0].subject).toBe('新增本地文档');
    expect((await getDiff(repo, { commit: log[0].hash, path: '新文件.txt' })).text).toContain(
      '+hello',
    );
  });

  it('区分同一文件的已暂存和未暂存差异，并完整识别重命名', async () => {
    const { repo } = await setup();
    await commitFile(repo, 'original file.txt');
    await git(repo, 'mv', 'original file.txt', 'renamed file.txt');
    await writeFile(path.join(repo, 'renamed file.txt'), 'second\n');
    const state = await readRepository(repo);
    expect(state.files[0].originalPath).toBe('original file.txt');
    expect(state.files[0].indexStatus).toBe('R');
    expect(state.files[0].worktreeStatus).toBe('M');
    expect((await getDiff(repo, { path: 'renamed file.txt', staged: true })).text).toContain(
      'rename to',
    );
    expect((await getDiff(repo, { path: 'renamed file.txt' })).text).toContain('+second');
  });

  it('真实计算上游的领先提交，显示获取时间并支持仅快进拉取', async () => {
    const { root, repo } = await setup();
    const remote = path.join(root, 'remote.git');
    await git(root, 'init', '--bare', remote);
    await commitFile(repo);
    await git(repo, 'remote', 'add', 'origin', remote);
    await git(repo, 'push', '-u', 'origin', 'main');
    await commitFile(repo, 'next.txt');
    const state = await readRepository(repo);
    expect(state.ahead).toBe(1);
    expect(state.behind).toBe(0);
    expect(state.upstream).toBe('origin/main');
    await performAction(repo, { type: 'fetch' });
    expect((await readRepository(repo)).fetchedAt).not.toBeNull();
    await writeFile(path.join(repo, 'dirty.txt'), 'unsaved\n');
    await expect(performAction(repo, { type: 'pull' })).rejects.toThrow('工作区');
  });

  it('获取清理各远端已删除分支的缓存，保留本地分支、修改和已合并历史', async () => {
    const { root, repo } = await setup();
    await commitFile(repo);
    await git(repo, 'switch', '-c', 'feature/completed');
    const feature = await commitFile(repo, 'feature.txt');
    await git(repo, 'switch', 'main');
    await commitFile(repo, 'main.txt');
    await git(repo, 'merge', '--no-ff', 'feature/completed', '-m', 'merge completed feature');
    const head = await git(repo, 'rev-parse', 'HEAD');
    for (const name of ['origin', 'community']) {
      const remote = path.join(root, `${name}.git`);
      await git(root, 'init', '--bare', remote);
      await git(repo, 'remote', 'add', name, remote);
      await git(repo, 'push', name, 'main', 'feature/completed');
      // Delete at the remote, as another user or GitHub would; keep this client's cache stale.
      await git(remote, 'update-ref', '-d', 'refs/heads/feature/completed');
    }
    await writeFile(path.join(repo, 'feature.txt'), 'uncommitted local edits\n');
    await writeFile(path.join(repo, 'untracked.txt'), 'keep this too\n');
    const before = await readRepository(repo);
    expect(
      before.branches.filter((b) => b.remote && b.name.endsWith('/feature/completed')),
    ).toHaveLength(2);

    await performAction(repo, { type: 'fetch' });

    const after = await readRepository(repo);
    expect(
      after.branches
        .filter((b) => b.remote)
        .map((b) => b.name)
        .sort(),
    ).toEqual(['community/main', 'origin/main']);
    expect(after.branches.find((b) => b.name === 'feature/completed' && !b.remote)?.hash).toBe(
      feature,
    );
    expect(after.head).toBe(head);
    expect(after.branch).toBe('main');
    expect(after.files).toEqual(before.files);
    expect(await git(repo, 'diff')).toContain('uncommitted local edits');
    const tree = await readBranchTree(repo, { includeRemote: true });
    expect(tree.commits.find((c) => c.hash === head)?.parents).toContain(feature);
    expect(tree.commits.some((c) => c.hash === feature)).toBe(true);
    expect(
      tree.branches
        .filter((b) => b.remote)
        .map((b) => b.name)
        .sort(),
    ).toEqual(['community/main', 'origin/main']);
  });

  it('定向获取规则引用已删除分支时解释原因，修正规则后清理且保留本地分支', async () => {
    const { root, repo } = await setup();
    const head = await commitFile(repo);
    await git(repo, 'branch', 'feature/retired');
    const remote = path.join(root, 'targeted.git');
    await git(root, 'init', '--bare', remote);
    await git(repo, 'remote', 'add', 'origin', remote);
    await git(repo, 'push', 'origin', 'main', 'feature/retired');
    await git(
      repo,
      'config',
      '--replace-all',
      'remote.origin.fetch',
      '+refs/heads/feature/retired:refs/remotes/origin/feature/retired',
    );
    await git(
      repo,
      'config',
      '--add',
      'remote.origin.fetch',
      '+refs/heads/main:refs/remotes/origin/main',
    );
    await git(remote, 'update-ref', '-d', 'refs/heads/feature/retired');
    await expect(performAction(repo, { type: 'fetch' })).rejects.toMatchObject({
      code: 'remoteRefMissing',
      details: expect.stringContaining("couldn't find remote ref refs/heads/feature/retired"),
    });
    expect(await git(repo, 'config', '--get-all', 'remote.origin.fetch')).toContain(
      '+refs/heads/feature/retired:',
    );
    await git(
      repo,
      'config',
      '--replace-all',
      'remote.origin.fetch',
      '+refs/heads/*:refs/remotes/origin/*',
    );
    await performAction(repo, { type: 'fetch' });
    const state = await readRepository(repo);
    expect(state.branches.some((b) => b.name === 'origin/feature/retired')).toBe(false);
    expect(state.branches.find((b) => b.name === 'feature/retired')?.hash).toBe(head);
    expect(state.head).toBe(head);
  });

  it('按提交祖先识别整合，不把目标自己的提交误算为待整合', async () => {
    const { root, repo } = await setup();
    const sourceHead = await commitFile(repo);
    const target = path.join(root, 'target');
    await git(root, 'clone', repo, target);
    await git(target, 'config', 'user.name', 'MeGit Test');
    await git(target, 'config', 'user.email', 'test@example.invalid');
    await commitFile(target, 'private.txt');
    expect(await inspectIntegration(repo, target, 'HEAD', 'HEAD')).toMatchObject({
      state: 'integrated',
      sourceHead,
      pending: 0,
    });
    const newHead = await commitFile(repo, 'public-new.txt');
    expect(await inspectIntegration(repo, target, 'HEAD', 'HEAD')).toMatchObject({
      state: 'unknown',
      sourceHead: newHead,
      pending: null,
    });
    await git(target, 'fetch', 'origin');
    expect(await inspectIntegration(repo, target, 'HEAD', 'HEAD')).toMatchObject({
      state: 'pending',
      pending: 1,
    });
    await expect(inspectIntegration(repo, target, '--output=bad', 'HEAD')).rejects.toThrow();
  });

  it('标记脱离分支并拒绝无上游推送；限制差异中的提交参数', async () => {
    const { repo } = await setup();
    await commitFile(repo);
    await git(repo, 'checkout', '--detach');
    expect((await readRepository(repo)).detached).toBe(true);
    await expect(performAction(repo, { type: 'push' })).rejects.toThrow('跟踪');
    await expect(getDiff(repo, { commit: '--help' })).rejects.toThrow();
  });

  it('合并提交按第一父提交展示整合内容', async () => {
    const { repo } = await setup();
    await commitFile(repo, 'base.txt');
    await git(repo, 'checkout', '-b', '功能/登录');
    const source = await commitFile(repo, 'feature.txt', 'new feature\n');
    await git(repo, 'checkout', 'main');
    await commitFile(repo, 'main-only.txt');
    await git(repo, 'merge', '--no-ff', '功能/登录', '-m', '整合登录功能');
    const history = await getHistory(repo);
    expect(history[0].parents).toHaveLength(2);
    expect((await getDiff(repo, { commit: history[0].hash })).text).toContain('+new feature');
    expect(await inspectIntegration(repo, repo, source, 'main')).toMatchObject({
      state: 'integrated',
      sourceHead: source,
    });
  });

  it('支持合法的中文分支名作为整合引用', async () => {
    const { repo } = await setup();
    const head = await commitFile(repo);
    await git(repo, 'branch', '功能/登录');
    expect(await inspectIntegration(repo, repo, '功能/登录', 'main')).toMatchObject({
      state: 'integrated',
      sourceHead: head,
    });
  });
});
