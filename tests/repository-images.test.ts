import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdir, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { WorkspaceStore } from '../server/workspace.js';
import { fixture } from './fixtures.js';
import type { Workspace } from '../shared/types.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';

async function setup() {
  const f = await fixture();
  cleanups.push(f.cleanup);
  await mkdir(path.join(f.repo, 'assets'));
  await writeFile(path.join(f.repo, 'assets', '项目 logo.svg'), svg);
  const dataDirectory = path.join(f.root, 'data');
  const store = new WorkspaceStore(dataDirectory);
  const initial = await store.read();
  initial.repositories.push({ id: 'repo', name: '项目', path: f.repo });
  await store.save(initial);
  const server = createApp({ dataDirectory }).listen(0, '127.0.0.1');
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
  const { token } = (await (await fetch(`${base}/api/session`)).json()) as { token: string };
  const headers = { 'X-MeGit-Token': token, 'Content-Type': 'application/json' };
  const images = (directory = '', offset = 0) =>
    fetch(
      `${base}/api/repositories/repo/images?${new URLSearchParams({ directory, offset: String(offset) })}`,
      { headers },
    );
  const image = (file: string) =>
    fetch(`${base}/api/repositories/repo/image?${new URLSearchParams({ path: file })}`, {
      headers,
    });
  const workspace = () =>
    fetch(`${base}/api/workspace`, { headers }).then((res) => res.json()) as Promise<Workspace>;
  const save = (value: Workspace) =>
    fetch(`${base}/api/workspace`, { method: 'PUT', headers, body: JSON.stringify(value) });
  return { ...f, base, headers, images, image, workspace, save, dataDirectory };
}

describe('仓库头像的本机图片边界', () => {
  it('浏览仓库内目录与图片，按需读取并保存相对路径，兼容旧配置', async () => {
    const f = await setup();
    const initial = await f.workspace();
    expect(initial.repositories[0]).not.toHaveProperty('logoPath');
    expect(await (await f.images()).json()).toMatchObject({
      directory: '',
      entries: [{ name: 'assets', path: 'assets', kind: 'directory' }],
      hasMore: false,
    });
    expect(await (await f.images('assets')).json()).toMatchObject({
      entries: [{ name: '项目 logo.svg', path: 'assets/项目 logo.svg', kind: 'image' }],
    });
    const response = await f.image('assets/项目 logo.svg');
    expect(response.status).toBe(200);
    const preview = (await response.json()) as { dataUrl: string };
    expect(preview.dataUrl).toBe(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const updated = {
      ...initial,
      repositories: [{ ...initial.repositories[0], logoPath: 'assets/项目 logo.svg' }],
    };
    expect((await f.save(updated)).status).toBe(200);
    expect((await new WorkspaceStore(f.dataDirectory).read()).repositories[0]).toMatchObject({
      logoPath: 'assets/项目 logo.svg',
    });
    const restored = await f.workspace();
    delete restored.repositories[0].logoPath;
    expect((await f.save(restored)).status).toBe(200);
    expect((await f.workspace()).repositories[0]).not.toHaveProperty('logoPath');
  });

  it('目录分页只列目录和支持的图片，不读取 Git 内部或非图片文件', async () => {
    const f = await setup();
    await writeFile(path.join(f.repo, 'secret.txt'), 'not an image');
    await Promise.all(
      Array.from({ length: 105 }, (_, i) =>
        writeFile(path.join(f.repo, `icon-${String(i).padStart(3, '0')}.svg`), svg),
      ),
    );
    const first = (await (await f.images()).json()) as {
      entries: { name: string }[];
      hasMore: boolean;
    };
    expect(first.entries).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    expect(
      first.entries.some((entry) => entry.name === '.git' || entry.name === 'secret.txt'),
    ).toBe(false);
    expect(await (await f.images('', 100)).json()).toMatchObject({
      entries: Array.from({ length: 6 }, () => expect.any(Object)),
      hasMore: false,
    });
  });

  it('拒绝无令牌、跨站和未登记仓库的图片请求', async () => {
    const f = await setup();
    expect((await fetch(`${f.base}/api/repositories/repo/images`)).status).toBe(403);
    expect(
      (
        await fetch(`${f.base}/api/repositories/repo/image?path=assets/logo.svg`, {
          headers: { ...f.headers, Origin: 'https://outside.invalid' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(`${f.base}/api/repositories/missing/images`, { headers: f.headers })).status,
    ).toBe(404);
  });

  it('拒绝越界、绝对路径、Git 内部文件与目录链接，保存不能绕过验证', async () => {
    const f = await setup();
    for (const invalid of [
      '../outside.svg',
      '/outside.svg',
      'D:/outside.svg',
      'assets\\项目 logo.svg',
      'assets/../outside.svg',
      '.git/logo.svg',
      'assets/logo.svg:stream',
      'assets//logo.svg',
    ]) {
      expect((await f.image(invalid)).status, invalid).toBe(400);
      const value = await f.workspace();
      const changed = { ...value, repositories: [{ ...value.repositories[0], logoPath: invalid }] };
      expect((await f.save(changed)).status, invalid).toBe(400);
    }
    await mkdir(path.join(f.root, 'outside'));
    await writeFile(path.join(f.root, 'outside', 'logo.svg'), svg);
    await symlink(
      path.join(f.root, 'outside'),
      path.join(f.repo, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect((await f.image('linked/logo.svg')).status).toBe(400);
    expect((await f.images('linked')).status).toBe(400);
    const value = await f.workspace();
    expect(
      (
        await f.save({
          ...value,
          repositories: [{ ...value.repositories[0], logoPath: 'linked/logo.svg' }],
        })
      ).status,
    ).toBe(400);
  });

  it('校验图片内容与大小，文件丢失不破坏已经保存的白板', async () => {
    const f = await setup();
    await writeFile(path.join(f.repo, 'fake.png'), '<html>not an image</html>');
    await writeFile(path.join(f.repo, 'large.svg'), `<svg>${' '.repeat(1024 * 1024)}</svg>`);
    expect(await (await f.image('fake.png')).json()).toMatchObject({ code: 'repositoryImageType' });
    expect(await (await f.image('large.svg')).json()).toMatchObject({
      code: 'repositoryImageSize',
    });
    expect(await (await f.image('missing.svg')).json()).toMatchObject({
      code: 'repositoryImageMissing',
    });
    const value = await f.workspace();
    expect(
      (
        await f.save({
          ...value,
          repositories: [{ ...value.repositories[0], logoPath: 'missing.svg' }],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.save({
          ...value,
          repositories: [{ ...value.repositories[0], logoPath: 'assets/项目 logo.svg' }],
        })
      ).status,
    ).toBe(200);
    await unlink(path.join(f.repo, 'assets', '项目 logo.svg'));
    expect((await new WorkspaceStore(f.dataDirectory).read()).repositories[0].logoPath).toBe(
      'assets/项目 logo.svg',
    );
    const afterRemoval = await f.workspace();
    afterRemoval.boards[0].name = '图片丢失后仍可编辑白板';
    expect((await f.save(afterRemoval)).status).toBe(200);
    expect((await f.image('assets/项目 logo.svg')).status).toBe(404);
  });
});
