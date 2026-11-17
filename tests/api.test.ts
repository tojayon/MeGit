import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
