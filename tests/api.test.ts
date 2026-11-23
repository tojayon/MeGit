import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fixture, commitFile, git } from './fixtures.js';
import { createApp } from '../server/app.js';
import type { Workspace } from '../shared/types.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});

async function setup() {
  const f = await fixture();
  cleanups.push(f.cleanup);
  await commitFile(f.repo);
  const app = createApp({ dataDirectory: path.join(f.root, 'data') });
  const server: Server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  const session = (await fetch(`${base}/api/session`).then((r) => r.json())) as { token: string };
  const headers = {
    'Content-Type': 'application/json',
    'X-MeGit-Token': session.token,
    Origin: base,
  };
  return { ...f, base, headers };
}

describe('本机 API 边界与端到端 Git 数据', () => {
  it('直接同步要求已确认的分支与上游，拒绝失效的确认', async () => {
    const { repo, root, base, headers } = await setup();
    const remote = path.join(root, 'remote.git');
    await git(root, 'init', '--bare', remote);
    await git(repo, 'remote', 'add', 'origin', remote);
    await git(repo, 'push', '-u', 'origin', 'main');
    const upstreamHead = await git(remote, 'rev-parse', 'refs/heads/main');
    const head = await commitFile(repo, 'outgoing.txt');
    const workspace: Workspace = await fetch(`${base}/api/workspace`, { headers }).then((res) => res.json());
    workspace.repositories = [{ id: 'sync-repo', name: 'A', path: repo }];
    expect((await fetch(`${base}/api/workspace`, {
      method: 'PUT', headers, body: JSON.stringify(workspace),
    })).ok).toBe(true);
    const send = (body: unknown) => fetch(`${base}/api/repositories/sync-repo/actions`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const expected = { branch: 'main', head, remote: 'origin', ref: 'refs/heads/main', upstreamHead };
    expect((await send({ type: 'pull' })).status).toBe(400);
    expect((await send({ type: 'push', expected: { ...expected, head: upstreamHead } })).status).toBe(409);
    expect((await send({ type: 'push', expected: { ...expected, ref: 'refs/heads/other' } })).status).toBe(409);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(upstreamHead);
    expect((await send({ type: 'push', expected })).ok).toBe(true);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(head);
  });

  it.each(['integrate', 'push', 'pull'] as const)('执行已确认的连线操作 %s', async (type) => {
    const { repo, root, base, headers } = await setup();
    const other = path.join(root, 'other repo');
    await mkdir(other);
    const initial = await git(repo, 'rev-parse', 'HEAD');
    let newer: string;
    if (type === 'integrate') {
      await git(root, 'clone', '--', repo, other);
      await git(other, 'remote', 'remove', 'origin');
      newer = await commitFile(repo, 'incoming.txt', 'from A');
    } else {
      await git(other, 'init', '--bare');
      await git(repo, 'remote', 'add', 'origin', other);
      await git(repo, 'push', '-u', 'origin', 'main');
      await git(repo, 'push', 'origin', 'main:other');
      if (type === 'push') {
        newer = await commitFile(repo, 'incoming.txt', 'from A');
      } else {
        const publisher = path.join(root, 'publisher');
        await git(root, 'clone', '-b', 'main', '--', other, publisher);
        await git(publisher, 'config', 'user.name', 'MeGit Test');
        await git(publisher, 'config', 'user.email', 'test@example.invalid');
        newer = await commitFile(publisher, 'incoming.txt', 'from remote');
        await git(publisher, 'push');
        await git(repo, 'fetch', 'origin');
      }
    }
    const workspace: Workspace = await fetch(`${base}/api/workspace`, { headers }).then((r) => r.json());
    workspace.repositories = [{ id: 'repo-a', name: 'A', path: repo }];
    if (type === 'integrate') workspace.repositories.push({ id: 'repo-b', name: 'B', path: other });
    const board = workspace.boards[0];
    const targetRepo = type === 'integrate' ? 'repo-b' : 'repo-a';
    const targetRef = type === 'integrate' ? 'refs/heads/main' : 'refs/remotes/origin/main';
    board.nodes = [
      { id: 'a', repoId: 'repo-a', ref: 'refs/heads/main', position: { x: 0, y: 0 } },
      { id: 'b', repoId: targetRepo, ref: targetRef, position: { x: 500, y: 0 } },
    ];
    const edge = { id: 'link', source: 'a', target: 'b', kind: 'integration' as const, label: '' };
    board.edges = [edge];
    const save = async () => {
      const response = await fetch(`${base}/api/workspace`, { method: 'PUT', headers, body: JSON.stringify(workspace) });
      expect(response.ok).toBe(true);
      workspace.revision = (await response.json()).revision;
    };
    await save();
    const action = (overrides = {}) => fetch(`${base}/api/boards/${board.id}/relations/link/action`, {
      method: 'POST', headers, body: JSON.stringify({
        type, source: 'a', target: 'b', sourceRepo: 'repo-a', targetRepo,
        sourceRef: 'refs/heads/main', targetRef,
        sourceHead: type === 'pull' ? initial : newer,
        targetHead: type === 'pull' ? newer : initial, ...overrides,
      }),
    });
    if (type === 'integrate') {
      expect((await action()).status).toBe(409);
      board.edges = [{ ...edge, localIntegration: true }];
      await save();
      await writeFile(path.join(other, 'dirty.txt'), 'untouched');
      expect(await (await action()).json()).toMatchObject({ code: 'dirtyPull' });
      expect(await git(other, 'rev-parse', 'HEAD')).toBe(initial);
      await git(other, 'clean', '-f', '--', 'dirty.txt');
      await git(other, 'config', 'user.name', 'MeGit Test');
      await git(other, 'config', 'user.email', 'test@example.invalid');
      const divergent = await commitFile(other, 'divergent.txt', 'independent');
      expect(await (await action({ targetHead: divergent })).json()).toMatchObject({ code: 'relationNonFastForward' });
      expect(await git(other, 'rev-parse', 'HEAD')).toBe(divergent);
      await git(other, 'reset', '--hard', initial);
      await git(other, 'switch', '-c', 'not-the-target');
      expect((await action()).status).toBe(409);
      await git(other, 'switch', 'main');
    } else {
      await git(repo, 'branch', '--set-upstream-to=origin/other');
      expect((await action()).status).toBe(409);
      await git(repo, 'branch', '--set-upstream-to=origin/main');
      if (type === 'push') {
        await git(repo, 'remote', 'set-url', '--push', 'origin', path.join(root, 'wrong repo'));
        expect(await (await action()).json()).toMatchObject({ code: 'relationRemoteMismatch' });
        await git(repo, 'config', '--unset', 'remote.origin.pushurl');
      }
    }
    expect((await action({ sourceRepo: 'repo-b' })).status).toBe(409);
    expect((await action({ sourceHead: type === 'pull' ? newer : initial })).status).toBe(409);
    const response = await action();
    expect(response.status, await response.text()).toBe(200);
    expect(await git(type === 'pull' ? repo : other, 'rev-parse', 'refs/heads/main')).toBe(newer);
    if (type === 'integrate') {
      expect(await readFile(path.join(other, 'incoming.txt'), 'utf8')).toBe('from A');
      expect(await git(other, 'remote')).toBe('');
    }
  });
  it('跨仓库审阅不导入对象，显式准备和提交保留双方历史', async () => {
    const { base, headers, repo, root } = await setup();
    const target = path.join(root, 'merge-target');
    await git(root, 'clone', '--', repo, target);
    await git(target, 'remote', 'remove', 'origin');
    await git(target, 'config', 'user.name', 'MeGit Test');
    await git(target, 'config', 'user.email', 'test@example.invalid');
    await git(target, 'config', 'commit.gpgsign', 'false');
    const sourceHead = await commitFile(repo, 'incoming.txt', 'from source\n');
    const targetHead = await commitFile(target, 'existing.txt', 'from target\n');
    const workspace = (await fetch(`${base}/api/workspace`, { headers }).then((r) => r.json())) as Workspace;
    workspace.repositories = [
      { id: 'a', name: 'Source', path: repo.replaceAll('\\', '/') },
      { id: 'b', name: 'Target', path: target.replaceAll('\\', '/') },
    ];
    const board = workspace.boards[0];
    board.nodes = [
      { id: 'a-node', repoId: 'a', position: { x: 0, y: 0 } },
      { id: 'b-node', repoId: 'b', position: { x: 500, y: 0 } },
    ];
    const edge = { id: 'link', kind: 'integration' as const, source: 'a-node', target: 'b-node', label: '' };
    const save = async (localMerge: boolean) => {
      board.edges = [{ ...edge, localMerge: localMerge || undefined }];
      const response = await fetch(`${base}/api/workspace`, { method: 'PUT', headers, body: JSON.stringify(workspace) });
      const saved = await response.json();
      expect(response.ok, JSON.stringify(saved)).toBe(true);
      workspace.revision = saved.revision;
    };
    const refs = { source: 'a-node', target: 'b-node', sourceRepo: 'a', targetRepo: 'b', sourceRef: 'refs/heads/main', targetRef: 'refs/heads/main', sourceHead, targetHead };
    const merge = (step: string, fields: Record<string, unknown> = {}) => fetch(`${base}/api/boards/${board.id}/relations/link/merge`, {
      method: 'POST', headers, body: JSON.stringify({ ...refs, step, ...fields }),
    });
    await save(false);
    expect((await merge('prepare')).status).toBe(409);
    await save(true);
    const review = await (await merge('review')).json();
    expect(review).toMatchObject({ phase: 'review', sourceTotal: 1, targetTotal: 1, diff: { text: expect.stringContaining('+from source') } });
    const calls: string[] = [];
    let changeDuringReview = false;
    let modelMessage = 'Merge source changes';
    const provider = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      calls.push(raw);
      if (changeDuringReview) {
        await writeFile(path.join(target, 'incoming.txt'), 'new staged content');
        await git(target, 'add', '--', 'incoming.txt');
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: 'Review fixture advice', message: modelMessage }) } }] }));
    }).listen(0, '127.0.0.1');
    await once(provider, 'listening');
    cleanups.push(() => new Promise((resolve, reject) => provider.close((error) => error ? reject(error) : resolve())));
    const address = provider.address();
    if (!address || typeof address === 'string') throw new Error('No provider port');
    expect((await fetch(`${base}/api/ai/settings`, {
      method: 'PUT', headers, body: JSON.stringify({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'review-fixture' }),
    })).ok).toBe(true);
    await writeFile(path.join(repo, '.env'), 'LOCAL_SECRET_NEVER_SEND');
    const aiReview = (reviewKey: string, approved = true) => fetch(`${base}/api/ai/assist`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'mergeReview', boardId: board.id, edgeId: 'link',
        selection: refs, reviewKey, approved, language: 'en' }),
    });
    expect((await aiReview(review.reviewKey, false)).status).toBe(400);
    expect(calls).toHaveLength(0);
    const advice = { kind: 'mergeReview', text: 'Review fixture advice', message: 'Merge source changes' };
    expect(await (await aiReview(review.reviewKey)).json()).toEqual(advice);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('from source');
    expect(calls[0]).not.toContain('LOCAL_SECRET_NEVER_SEND');
    expect(calls[0]).not.toContain('merge-target');
    await expect(git(target, 'cat-file', '-e', sourceHead)).rejects.toThrow();
    expect(await git(target, 'status', '--porcelain')).toBe('');
    expect((await merge('prepare', { sourceHead: targetHead })).status).toBe(409);
    const prepared = await (await merge('prepare')).json();
    expect(prepared).toMatchObject({ phase: 'pending', conflicts: [], ready: true, diff: { text: expect.stringContaining('incoming.txt') } });
    expect(await git(target, 'rev-parse', 'HEAD')).toBe(targetHead);
    expect(await git(target, 'rev-parse', 'MERGE_HEAD')).toBe(sourceHead);
    expect(await git(target, 'show', ':incoming.txt')).toBe('from source');
    expect(await git(target, 'remote')).toBe('');
    expect((await merge('commit', { session: prepared.session, index: 'a'.repeat(64), message: 'Merge source' })).status).toBe(409);
    await writeFile(path.join(target, 'extra.txt'), 'not reviewed');
    expect(await (await merge('commit', { session: prepared.session, index: prepared.index, message: 'Merge source' })).json())
      .toMatchObject({ code: 'relationMergeUnstaged' });
    await git(target, 'clean', '-f', '--', 'extra.txt');
    await writeFile(path.join(target, 'incoming.txt'), 'edited since review');
    await git(target, 'add', '--', 'incoming.txt');
    expect(await (await merge('commit', { session: prepared.session, index: prepared.index, message: 'Merge source' })).json())
      .toMatchObject({ code: 'relationMergeIndexChanged' });
    expect((await merge('abort', { session: prepared.session })).ok).toBe(true);
    expect(await git(target, 'status', '--porcelain')).toBe('');
    const afterAbort = await (await merge('prepare')).json();
    expect((await aiReview(review.reviewKey)).status).toBe(409);
    expect(calls).toHaveLength(1);
    expect(await (await aiReview(afterAbort.reviewKey)).json()).toEqual(advice);
    expect(calls[1]).toContain('pending');
    modelMessage = 'Not a valid\nmerge subject';
    expect(await (await aiReview(afterAbort.reviewKey)).json()).toEqual({ kind: 'mergeReview', text: 'Review fixture advice', message: null });
    changeDuringReview = true;
    expect(await (await aiReview(afterAbort.reviewKey)).json()).toMatchObject({ code: 'aiMergeReviewChanged' });
    await git(target, 'merge', '--abort');
    await git(target, 'merge', '--no-ff', '--no-commit', sourceHead);
    expect((await merge('abort', { session: afterAbort.session })).status).toBe(409);
    expect(await git(target, 'rev-parse', 'MERGE_HEAD')).toBe(sourceHead);
    await git(target, 'merge', '--abort');
    const preparedAgain = await (await merge('prepare')).json();
    await commitFile(repo, 'later.txt', 'not included');
    const resumed = await (await merge('review')).json();
    expect(resumed).toMatchObject({ phase: 'pending', session: preparedAgain.session, sourceHead });
    const finished = await merge('commit', { session: resumed.session, index: resumed.index, message: 'Merge source' });
    expect(finished.status, await finished.text()).toBe(200);
    expect(await git(target, 'show', '-s', '--format=%P', 'HEAD')).toBe(`${targetHead} ${sourceHead}`);
    expect(await git(target, 'status', '--porcelain')).toBe('');
    expect(await readFile(path.join(target, 'existing.txt'), 'utf8')).toBe('from target\n');
    await expect(readFile(path.join(target, 'later.txt'))).rejects.toThrow();
  }, 60000);

  it('提交点创建沿用会话和登记校验，严格接收完整提交编号', async () => {
    const { base, headers, repo } = await setup();
    const workspace = (await fetch(`${base}/api/workspace`, { headers }).then((r) =>
      r.json(),
    )) as Workspace;
    workspace.repositories.push({ id: 'commit-api', name: 'fixture', path: repo });
    expect(
      (
        await fetch(`${base}/api/workspace`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(workspace),
        })
      ).status,
    ).toBe(200);
    const hash = await git(repo, 'rev-parse', 'HEAD');
    const action = {
      type: 'createBranch',
      name: 'from-commit',
      startPoint: 'COMMIT',
      startHash: hash,
      checkout: false,
      track: false,
      expected: { branch: 'main', head: hash, detached: false },
    };
    const send = (id: string, body: unknown, withToken = true) =>
      fetch(`${base}/api/repositories/${id}/actions`, {
        method: 'POST',
        headers: withToken ? headers : { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(body),
      });
    expect((await send('commit-api', action, false)).status).toBe(403);
    expect((await send('unknown', action)).status).toBe(404);
    for (const startHash of ['HEAD~1', hash.slice(0, 7), '--help']) {
      const response = await send('commit-api', { ...action, startHash });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'invalidAction' });
    }
    const response = await send('commit-api', action);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: { branch: 'main', head: hash } });
    expect(await git(repo, 'rev-parse', 'refs/heads/from-commit')).toBe(hash);
  });

  it('应用错误使用稳定代码返回，供页面按所选语言呈现', async () => {
    const { base, headers } = await setup();
    const response = await fetch(`${base}/api/repositories/inspect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: 'relative-path' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'pathAbsolute' });
  });

  it('拒绝跨站、错误 Host、无令牌调用及未登记仓库', async () => {
    const { base, headers } = await setup();
    expect((await fetch(`${base}/api/workspace`)).status).toBe(403);
    expect(
      (
        await fetch(`${base}/api/workspace`, {
          headers: { ...headers, Origin: 'https://attacker.invalid' },
        })
      ).status,
    ).toBe(403);
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `${base}/api/session`,
        { headers: { Host: 'attacker.invalid' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(invalidHostStatus).toBe(403);
    expect((await fetch(`${base}/api/repositories/missing/history`, { headers })).status).toBe(404);
  });

  it('登记真实仓库后返回状态与历史，重启配置可恢复，过期保存被拒绝', async () => {
    const { base, headers, repo } = await setup();
    const workspace = (await fetch(`${base}/api/workspace`, { headers }).then((r) =>
      r.json(),
    )) as Workspace;
    const id = randomUUID();
    workspace.repositories.push({ id, name: '示例仓库', path: repo });
    workspace.boards[0].nodes.push({ id: 'n1', repoId: id, position: { x: 200, y: 100 } });
    const response = await fetch(`${base}/api/workspace`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(workspace),
    });
    expect(response.status).toBe(200);
    expect(
      (
        await fetch(`${base}/api/workspace`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(workspace),
        })
      ).status,
    ).toBe(409);
    const snapshot = await fetch(`${base}/api/snapshot`, { headers }).then((r) => r.json());
    expect(snapshot.repositories[id].branch).toBe('main');
    const history = await fetch(`${base}/api/repositories/${id}/history`, { headers }).then((r) =>
      r.json(),
    );
    expect(history[0].subject).toBe('测试提交');
    expect(
      (
        await fetch(`${base}/api/repositories/${id}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'reset' }),
        })
      ).status,
    ).toBe(400);
  });

  it('分支动作必须携带前置状态、精确目标且拒绝额外的强制参数', async () => {
    const { base, headers, repo } = await setup();
    const workspace = await fetch(`${base}/api/workspace`, { headers }).then((r) => r.json());
    workspace.repositories = [{ id: 'branch-repo', name: '分支示例', path: repo }];
    workspace.boards[0].nodes = [{ id: 'n', repoId: 'branch-repo', position: { x: 0, y: 0 } }];
    expect(
      (
        await fetch(`${base}/api/workspace`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(workspace),
        })
      ).status,
    ).toBe(200);
    const head = await git(repo, 'rev-parse', 'HEAD');
    const action = {
      type: 'createBranch',
      name: '功能/API',
      startPoint: 'HEAD',
      startHash: head,
      checkout: true,
      track: false,
      expected: { branch: 'main', head, detached: false },
    };
    const send = (body: unknown, requestHeaders = headers, id = 'branch-repo') =>
      fetch(`${base}/api/repositories/${id}/actions`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
    for (const body of [
      { ...action, expected: undefined },
      { ...action, force: true },
      { ...action, startHash: '--help' },
      { ...action, checkout: 'yes' },
      { type: 'deleteBranch', name: 'main' },
    ])
      expect((await send(body)).status).toBe(400);
    expect((await send(action, { ...headers, Origin: 'https://outside.invalid' })).status).toBe(
      403,
    );
    expect((await send(action, { ...headers, 'X-MeGit-Token': '' })).status).toBe(403);
    expect((await send(action, headers, 'unregistered')).status).toBe(404);
    const created = await send(action);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ state: { branch: '功能/API', head } });
    const stale = await send({ ...action, name: 'outdated' });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'branchStateChanged' });
    expect(await git(repo, 'branch', '--list', 'outdated')).toBe('');
  });
});
