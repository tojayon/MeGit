import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { fixture, commitFile, git } from './fixtures.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup(empty = false) {
  const f = await fixture();
  cleanups.push(f.cleanup);
  if (!empty) await commitFile(f.repo, 'root.txt');
  const server: Server = createApp({ dataDirectory: path.join(f.root, 'data') }).listen(
    0,
    '127.0.0.1',
  );
  await once(server, 'listening');
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const base = 'http://127.0.0.1:' + address.port;
  const { token } = await fetch(base + '/api/session').then((r) => r.json());
  const headers = { 'Content-Type': 'application/json', 'X-MeGit-Token': token, Origin: base };
  const workspace = await fetch(base + '/api/workspace', { headers }).then((r) => r.json());
  workspace.repositories = [{ id: 'tree', name: '示例树', path: f.repo.replaceAll('\\', '/') }];
  workspace.boards[0].nodes = [{ id: 'n', repoId: 'tree', position: { x: 0, y: 0 } }];
  expect(
    (
      await fetch(base + '/api/workspace', {
        method: 'PUT',
        headers,
        body: JSON.stringify(workspace),
      })
    ).status,
  ).toBe(200);
  const get = (route: string) => fetch(base + '/api/repositories/tree/' + route, { headers });
  return { ...f, get, base, headers };
}

describe('真实分支树的只读 API', () => {
  it('仅选择远端树干时也读取其完整历史，长合法引用可以作为树干和比较对象', async () => {
    const f = await setup();
    const root = await git(f.repo, 'rev-parse', 'HEAD');
    await git(f.repo, 'switch', '-c', 'remote-development');
    const middle = await commitFile(f.repo, 'remote-middle.txt');
    const tip = await commitFile(f.repo, 'remote-tip.txt');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/feature', tip);
    await git(f.repo, 'switch', 'main');
    await git(f.repo, 'branch', '-D', 'remote-development');
    const result = await (await f.get('branch-tree?base=refs%2Fremotes%2Forigin%2Ffeature')).json();
    expect(result.commits.map((commit: { hash: string }) => commit.hash)).toEqual(
      expect.arrayContaining([root, middle, tip]),
    );
    expect(result.branches.filter((branch: { remote: boolean }) => branch.remote)).toHaveLength(1);
    const long = 'feature/' + 'x'.repeat(229);
    if (process.platform === 'win32')
      await git(f.repo, 'config', '--local', 'core.longpaths', 'true');
    await git(f.repo, 'branch', long);
    const ref = 'refs/heads/' + long;
    expect((await f.get('branch-tree?' + new URLSearchParams({ base: ref }))).status).toBe(200);
    expect(
      (
        await f.get(
          'branch-comparison?' + new URLSearchParams({ source: ref, target: 'refs/heads/main' }),
        )
      ).status,
    ).toBe(200);
  });
  it('读取真实分叉和多父合流，同名标签不影响树干，读取不改变工作区或 index', async () => {
    const f = await setup();
    const root = await git(f.repo, 'rev-parse', 'HEAD');
    await git(f.repo, 'tag', 'main', root);
    await git(f.repo, 'switch', '-c', 'feature');
    const tip = await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    await commitFile(f.repo, 'main.txt');
    await git(f.repo, 'merge', '--no-ff', '--no-edit', 'refs/heads/feature');
    const merge = await git(f.repo, 'rev-parse', 'HEAD');
    await writeFile(path.join(f.repo, 'draft.txt'), 'keep this draft');
    const indexBefore = await readFile(path.join(f.repo, '.git', 'index'));
    const response = await f.get('branch-tree');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.baseRef).toBe('refs/heads/main');
    expect(data.currentRef).toBe('refs/heads/main');
    expect(data.branches.map((b: { ref: string }) => b.ref)).toEqual(
      expect.arrayContaining(['refs/heads/main', 'refs/heads/feature']),
    );
    expect(data.commits.find((c: { hash: string }) => c.hash === merge).parents).toContain(tip);
    expect(data.commits).toHaveLength(4);
    expect(await readFile(path.join(f.repo, 'draft.txt'), 'utf8')).toBe('keep this draft');
    expect(await readFile(path.join(f.repo, '.git', 'index'))).toEqual(indexBefore);
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(merge);
  });

  it('不同分支独立读取上游和 worktree 路径，不把当前修改复制给其他分支', async () => {
    const f = await setup();
    const head = await git(f.repo, 'rev-parse', 'HEAD');
    await git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/example.git');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/main', head);
    await git(f.repo, 'branch', '--set-upstream-to=origin/main', 'main');
    await commitFile(f.repo, 'next.txt');
    const other = path.join(f.root, '独立 tree');
    await git(f.repo, 'worktree', 'add', '-b', 'parallel', other, head);
    const response = await f.get('branch-tree');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.branches.find((b: { name: string }) => b.name === 'main')).toMatchObject({
      upstream: 'refs/remotes/origin/main',
      ahead: 1,
      behind: 0,
    });
    expect(data.branches.find((b: { name: string }) => b.name === 'parallel')).toMatchObject({
      worktreePath: other.replaceAll('\\', '/'),
      upstream: null,
      ahead: null,
      behind: null,
    });
    expect(data.branches.some((b: { remote: boolean }) => b.remote)).toBe(false);
    const remote = await (await f.get('branch-tree?remote=true')).json();
    expect(remote.branches.some((b: { ref: string }) => b.ref === 'refs/remotes/origin/main')).toBe(
      true,
    );
  });

  it('按固定 SHA 比较独有提交和共同历史，改变树干不切换分支', async () => {
    const f = await setup();
    await git(f.repo, 'switch', '-c', 'feature');
    const sourceHash = await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    const targetHash = await commitFile(f.repo, 'main.txt');
    const comparison = await f.get(
      'branch-comparison?' +
        new URLSearchParams({
          source: 'refs/heads/feature',
          target: 'refs/heads/main',
          sourceHash,
          targetHash,
        }),
    );
    expect(comparison.status).toBe(200);
    expect(await comparison.json()).toMatchObject({
      sourceHash,
      targetHash,
      sourceOnly: 1,
      targetOnly: 1,
      relation: 'diverged',
      sourceCommits: [sourceHash],
      targetCommits: [targetHash],
    });
    const tree = await (await f.get('branch-tree?base=refs%2Fheads%2Ffeature')).json();
    expect(tree.baseRef).toBe('refs/heads/feature');
    expect(tree.currentRef).toBe('refs/heads/main');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await commitFile(f.repo, 'concurrent.txt');
    expect(
      (
        await f.get(
          'branch-comparison?' +
            new URLSearchParams({
              source: 'refs/heads/feature',
              target: 'refs/heads/main',
              sourceHash,
              targetHash,
            }),
        )
      ).status,
    ).toBe(409);
  });

  it('空仓库不伪造提交，detached HEAD 保留真实当前位置', async () => {
    const f = await setup(true);
    const empty = await f.get('branch-tree');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({
      commits: [],
      branches: [],
      baseRef: null,
      head: null,
    });
    const head = await commitFile(f.repo);
    await git(f.repo, 'switch', '--detach', head);
    expect(await (await f.get('branch-tree')).json()).toMatchObject({
      head,
      currentRef: null,
      detached: true,
    });
  });

  it('限制历史并保留枝梢真实父节点，不将截断历史画为共同树根', async () => {
    const f = await setup();
    await git(f.repo, 'branch', 'old-branch');
    for (let n = 0; n < 4; n++) await commitFile(f.repo, 'next-' + n + '.txt');
    const response = await f.get('branch-tree?limit=2');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.hasMore).toBe(true);
    expect(data.branches).toHaveLength(2);
    expect(
      data.commits.some((commit: { parents: string[] }) =>
        commit.parents.some(
          (parent) => !data.commits.some((c: { hash: string }) => c.hash === parent),
        ),
      ),
    ).toBe(true);
    const comparison = await (
      await f.get('branch-comparison?source=refs%2Fheads%2Fold-branch&target=refs%2Fheads%2Fmain')
    ).json();
    expect(comparison).toMatchObject({ sourceOnly: 0, targetOnly: 4, relation: 'included' });
  });

  it('无共同历史保持独立，拒绝任意表达式、无令牌和未登记路径访问', async () => {
    const f = await setup();
    await git(f.repo, 'checkout', '--orphan', 'unrelated');
    await git(f.repo, 'rm', '-rf', '--', '.');
    await commitFile(f.repo, 'different.txt');
    const response = await f.get(
      'branch-comparison?source=refs%2Fheads%2Funrelated&target=refs%2Fheads%2Fmain',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ relation: 'unrelated', mergeBases: [] });
    for (const query of ['base=main~1', 'base=--all', 'base=refs%2Ftags%2Fmain', 'limit=601'])
      expect((await f.get('branch-tree?' + query)).status).toBe(400);
    expect((await fetch(f.base + '/api/repositories/tree/branch-tree')).status).toBe(403);
    expect(
      (await fetch(f.base + '/api/repositories/missing/branch-tree', { headers: f.headers }))
        .status,
    ).toBe(404);
  });
});
