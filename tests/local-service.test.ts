import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import type { Workspace } from '../shared/types.js';
import { fixture, git } from './fixtures.js';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function listen(host = '127.0.0.1') {
  const server = createServer();
  server.listen(0, host);
  await once(server, 'listening');
  cleanups.push(async () => {
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
  });
  return { server, port: (server.address() as AddressInfo).port };
}

async function setup() {
  const fixtureRepo = await fixture();
  cleanups.push(fixtureRepo.cleanup);
  const app = createApp({ dataDirectory: path.join(fixtureRepo.root, 'isolated data') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanups.push(async () => {
    await app.locals.closeLocalServices?.();
    server.close();
    await once(server, 'close');
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const session = await fetch(`${base}/api/session`).then((response) => response.json());
  const headers = { 'Content-Type': 'application/json', 'X-MeGit-Token': session.token };
  const workspace: Workspace = await fetch(`${base}/api/workspace`, { headers }).then((response) =>
    response.json(),
  );
  workspace.repositories = [{ id: 'test-service', path: fixtureRepo.repo, name: 'Test service' }];
  const saved = await fetch(`${base}/api/workspace`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(workspace),
  });
  expect(saved.ok).toBe(true);
  const url = `${base}/api/repositories/test-service/local-service`;
  const call = async (method = 'GET', body?: unknown, extra = {}) => {
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  return { ...fixtureRepo, url, call, close: () => app.locals.closeLocalServices() };
}

async function packageFile(repo: string, port: number) {
  await writeFile(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { dev: 'node launcher.cjs' } }),
  );
  await writeFile(
    path.join(repo, 'launcher.cjs'),
    `
    require('node:child_process').spawn(process.execPath, ['service.cjs'], { stdio: 'inherit' });
    setInterval(() => {}, 1000);
  `,
  );
  await writeFile(
    path.join(repo, 'service.cjs'),
    `
    const http = require('node:http');
    console.log('fixture online');
    http.createServer((req, res) => res.end(String(process.pid))).listen(${port}, '127.0.0.1');
  `,
  );
}

const readPid = (port: number) =>
  fetch(`http://127.0.0.1:${port}`).then((response) => response.text());
const config = {
  kind: 'npm',
  entry: 'dev',
  directory: '.',
  port: null,
  revision: null,
  trusted: true,
};

describe.skipIf(process.platform !== 'win32')('本地服务', () => {
  it('要求显式审核，不接受跨源请求、越界路径或任意操作载荷', async () => {
    const { call, repo, url } = await setup();
    await packageFile(repo, 43210);
    expect((await fetch(url)).status).toBe(403);
    expect((await call('GET', undefined, { Origin: 'http://example.invalid' })).status).toBe(403);
    expect((await call()).data).toMatchObject({ config: null, status: 'stopped' });
    expect((await call('PUT', { ...config, trusted: false })).status).toBe(400);
    expect((await call('PUT', { ...config, directory: '..' })).status).toBe(400);
    expect(
      (await call('PUT', { ...config, kind: 'powershell', entry: '../outside.ps1' })).status,
    ).toBe(400);
    const result = await call('PUT', config);
    expect(result.status).toBe(200);
    const revision = result.data.config.revision;
    expect((await call('POST', { action: 'start', revision, command: 'anything' })).status).toBe(
      400,
    );
    await git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/other');
    expect((await call('POST', { action: 'start', revision })).data.code).toBe(
      'localServiceReview',
    );
  }, 15000);

  it('IPv6 占用同样是冲突，不执行启动入口', async () => {
    const { call, repo } = await setup();
    const { server, port } = await listen('::1');
    await packageFile(repo, port);
    const saved = await call('PUT', { ...config, port });
    expect(saved.status).toBe(200);
    const revision = saved.data.config.revision;
    expect((await call('POST', { action: 'start', revision })).status).toBe(200);
    await expect
      .poll(async () => (await call()).data, { timeout: 10000 })
      .toMatchObject({
        error: { code: 'localServicePortBusy' },
        ownerPid: process.pid,
      });
    expect((await call()).data.log).not.toContain('fixture online');
    expect(server.listening).toBe(true);
  }, 15000);

  it('审核带空格的 PowerShell 路径，未配置端口时展示进程状态', async () => {
    const { call, repo } = await setup();
    await writeFile(
      path.join(repo, 'start test.ps1'),
      `
      [Console]::WriteLine('PowerShell fixture online')
      Start-Sleep -Seconds 120
    `,
    );
    const saved = await call('PUT', { ...config, kind: 'powershell', entry: 'start test.ps1' });
    expect(saved.status).toBe(200);
    const revision = saved.data.config.revision;
    expect((await call('POST', { action: 'start', revision })).status).toBe(200);
    await expect
      .poll(async () => (await call()).data, { timeout: 10000 })
      .toMatchObject({
        status: 'running',
        log: expect.stringContaining('PowerShell fixture online'),
      });
    expect((await call('PUT', { ...config, revision })).data.code).toBe('localServiceActive');
    expect((await call('POST', { action: 'stop', revision })).data.status).toBe('stopped');
  }, 15000);

  it('保留外部监听，只重启本组子进程，并在 MeGit 关闭时释放端口', async () => {
    const { call, repo, close } = await setup();
    const { server, port } = await listen();
    await packageFile(repo, port);
    const result = await call('PUT', { ...config, port });
    expect(result.status).toBe(200);
    const revision = result.data.config.revision;
    const action = (name: string) => call('POST', { action: name, revision });
    const status = async () => (await call()).data;
    expect((await action('start')).status).toBe(200);
    await expect.poll(status, { timeout: 15000 }).toMatchObject({
      status: 'failed',
      error: { code: 'localServicePortBusy' },
      ownerPid: process.pid,
    });
    expect(await status()).not.toHaveProperty('runningSince');
    expect(server.listening).toBe(true);
    server.close();
    await once(server, 'close');
    expect((await action('start')).status).toBe(200);
    await expect
      .poll(status, { timeout: 15000 })
      .toMatchObject({ status: 'running', log: expect.stringContaining('fixture online') });
    const firstRunningSince = (await status()).runningSince;
    expect(firstRunningSince).toEqual(expect.any(Number));
    const first = await readPid(port);
    await writeFile(path.join(repo, 'package.json'), '{"scripts":{"dev":"node launcher.cjs"}}\n');
    expect((await action('restart')).data.code).toBe('localServiceReview');
    expect(await readPid(port)).toBe(first);
    expect((await status()).runningSince).toBe(firstRunningSince);
    await writeFile(path.join(repo, 'package.json'), '{"scripts":{"dev":"node launcher.cjs"}}');
    expect((await action('restart')).status).toBe(200);
    await expect.poll(() => readPid(port).catch(() => first), { timeout: 15000 }).not.toBe(first);
    await expect.poll(status).toMatchObject({ status: 'running' });
    expect((await status()).runningSince).toBeGreaterThan(firstRunningSince);
    await close();
    await expect(readPid(port)).rejects.toThrow();
  }, 45000);

  it('MeGit 非正常退出后只关闭自己的进程组', async () => {
    const { repo } = await setup();
    const { server, port } = await listen();
    server.close();
    await once(server, 'close');
    await packageFile(repo, port);
    const driver = path.join(repo, 'driver.mjs');
    const supervisor = new URL('../server/windows-local-service.ts', import.meta.url).href;
    await writeFile(
      driver,
      `
      import { startWindowsService } from ${JSON.stringify(supervisor)};
      startWindowsService({ directory: process.cwd(), kind: 'npm', entry: 'dev', port: ${port} }, () => {}, () => {});
    `,
    );
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), driver], {
      cwd: repo,
      windowsHide: true,
      stdio: 'ignore',
    });
    const exited = once(child, 'exit');
    cleanups.push(async () => {
      child.kill();
      await exited;
    });
    await expect.poll(() => readPid(port).catch(() => ''), { timeout: 15000 }).toMatch(/^\d+$/);
    child.kill();
    await exited;
    await expect
      .poll(
        async () =>
          readPid(port).then(
            () => true,
            () => false,
          ),
        { timeout: 10000 },
      )
      .toBe(false);
  }, 35000);
});
