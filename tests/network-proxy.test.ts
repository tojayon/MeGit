import { createServer } from 'node:http';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AppError } from '../server/errors.js';
import { performAction } from '../server/git.js';
import { checkRemoteRead } from '../server/remote-access.js';
import { NetworkSettings, normalizeProxy, withProxyFetch } from '../server/network-proxy.js';
import { fixture, git } from './fixtures.js';

it('persists only explicit HTTP(S) proxy settings, without credentials', async () => {
  const sample = await fixture();
  try {
    const folder = path.join(sample.root, 'settings');
    const settings = new NetworkSettings(folder);
    expect(await settings.read()).toEqual({ enabled: false, address: '' });
    for (const address of ['socks5://localhost:7890', 'http://user:secret@localhost:7890', 'http://localhost/path']) {
      expect(() => normalizeProxy(address)).toThrow(AppError);
    }
    await settings.save({ enabled: true, address: ' http://127.0.0.1:7890 ' });
    expect(await new NetworkSettings(folder).proxy()).toBe('http://127.0.0.1:7890');
    await settings.save({ enabled: false, address: 'http://127.0.0.1:7890' });
    expect(await settings.proxy()).toBeUndefined();
  } finally {
    await sample.cleanup();
  }
});

it('routes Git and AI HTTPS through the configured proxy, but not local destinations', async () => {
  const sample = await fixture();
  const targets: string[] = [];
  const proxy = createServer().on('connect', (req, socket) => {
    targets.push(req.url ?? '');
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
  }).listen(0, '127.0.0.1');
  const local = createServer((_req, res) => res.end('local')).listen(0, '127.0.0.1');
  await Promise.all([proxy, local].map((server) => new Promise<void>((resolve) => server.once('listening', resolve))));
  try {
    const address = proxy.address();
    const localAddress = local.address();
    if (!address || typeof address === 'string' || !localAddress || typeof localAddress === 'string') throw new Error('Expected TCP addresses');
    const url = `http://127.0.0.1:${address.port}`;
    await git(sample.repo, 'remote', 'add', 'origin', 'https://git.example.invalid/demo.git');
    await git(sample.repo, 'config', 'remote.origin.proxy', '');
    expect(await checkRemoteRead(sample.repo, 'origin', url)).toEqual({ status: 'proxyConnection' });
    await expect(performAction(sample.repo, { type: 'fetch' }, undefined, url)).rejects.toMatchObject({ code: 'proxyConnection' });
    await expect(performAction(sample.repo, { type: 'fetchRemote', remote: 'origin' }, undefined, url)).rejects.toMatchObject({ code: 'proxyConnection' });
    await expect(withProxyFetch(url)('https://ai.example.invalid/')).rejects.toMatchObject({ code: 'proxyConnection' });
    const response = await withProxyFetch(url)(`http://127.0.0.1:${localAddress.port}/`);
    expect(await response.text()).toBe('local');
    expect(targets).toEqual(['git.example.invalid:443', 'git.example.invalid:443', 'git.example.invalid:443', 'ai.example.invalid:443']);

    await git(sample.repo, 'remote', 'set-url', 'origin', 'git@git.example.invalid:project/repo.git');
    expect(await checkRemoteRead(sample.repo, 'origin', url)).toEqual({ status: 'proxyUnsupported' });
    const bare = path.join(sample.root, 'empty.git');
    await git(sample.root, 'init', '--bare', bare);
    await git(sample.repo, 'remote', 'set-url', 'origin', bare);
    expect(await checkRemoteRead(sample.repo, 'origin', url)).toEqual({ status: 'readable' });
    await expect(performAction(sample.repo, { type: 'fetch' }, undefined, url)).resolves.toBeDefined();
    expect(await git(sample.repo, 'config', 'remote.origin.proxy')).toBe('');
  } finally {
    await Promise.all([proxy, local].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await sample.cleanup();
  }
});
