import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const backend = fileURLToPath(new URL('.stage/backend/', import.meta.url));

async function listen() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function launch(context, port, searchPath = process.env.PATH) {
  const data = await mkdtemp(path.join(os.tmpdir(), 'megit-desktop-'));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'),
  );
  const child = spawn(
    path.join(backend, 'node.exe'),
    ['dist-server/server/index.js', '--production', '--desktop'],
    {
      cwd: backend,
      env: { ...env, Path: searchPath, MEGIT_PORT: String(port), MEGIT_DATA_DIR: data },
      windowsHide: true,
    },
  );
  const lines = createInterface({ input: child.stdout });
  const firstLine = once(lines, 'line');
  const closed = once(child, 'close');
  context.after(async () => {
    child.kill();
    await closed;
    await rm(data, { recursive: true, force: true });
  });
  return { child, firstLine, closed, data };
}

test(
  'bundled backend serves assets and protected API until its parent disconnects',
  { timeout: 15000 },
  async (context) => {
    const reservation = await listen();
    const { port } = reservation.address();
    await new Promise((resolve) => reservation.close(resolve));
    const git = execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)[0];
    const { child, firstLine, closed, data } = await launch(context, port, path.dirname(git));
    assert.deepEqual(await firstLine, ['READY']);
    const origin = `http://127.0.0.1:${port}`;
    assert.match(await (await fetch(origin)).text(), /<title>MeGit/);
    const { token } = await (await fetch(`${origin}/api/session`)).json();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await fetch(`${origin}/api/workspace`)).status, 403);
    assert.equal(
      (
        await fetch(`${origin}/api/workspace`, {
          headers: { 'x-megit-token': token, origin: 'http://localhost:8888' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/workspace`, {
          headers: { 'x-megit-token': token },
        })
      ).status,
      200,
    );
    const repository = path.join(data, 'example');
    execFileSync(git, ['init', '--initial-branch=main', repository], { windowsHide: true });
    const gitResult = await fetch(`${origin}/api/repositories/inspect`, {
      method: 'POST',
      headers: { 'x-megit-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ path: repository }),
    });
    assert.equal(gitResult.status, 200);
    assert.equal((await gitResult.json()).name, 'example');
    child.stdin.end();
    assert.deepEqual(await closed, [0, null]);
    await assert.rejects(fetch(`${origin}/api/session`));
  },
);

test(
  'bundled backend never reports readiness on an occupied port',
  { timeout: 15000 },
  async (context) => {
    const reservation = await listen();
    context.after(() => reservation.close());
    const { port } = reservation.address();
    const { firstLine, closed } = await launch(context, port);
    assert.deepEqual(await firstLine, ['PORT_BUSY']);
    assert.deepEqual(await closed, [1, null]);
    assert.equal(reservation.listening, true);
  },
);
