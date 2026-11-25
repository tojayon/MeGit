import { afterEach, expect, it } from 'vitest';
import { link, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitFile, fixture, git } from './fixtures.js';
import {
  inspectRepositoryEdit,
  previewRepositoryEdit,
  saveRepositoryEdit,
  listRepositoryFiles,
} from '../server/repository-files.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup() {
  const result = await fixture();
  cleanups.push(result.cleanup);
  await commitFile(result.repo);
  return result;
}

it('previews and edits a UTF-8 working file without staging or changing its line endings', async () => {
  const { repo } = await setup();
  await writeFile(path.join(repo, 'guide.md'), '旧内容\r\n');
  const target = { kind: 'text', path: 'guide.md' } as const;
  expect(await listRepositoryFiles(repo)).toContain('guide.md');
  const before = await inspectRepositoryEdit(repo, target);
  const request = { target, revision: before.revision, value: '新内容\n' };
  const preview = await previewRepositoryEdit(repo, request);
  expect(preview.changes).toEqual([
    { path: 'guide.md', before: '旧内容\r\n', after: '新内容\r\n' },
  ]);
  expect(await readFile(path.join(repo, 'guide.md'), 'utf8')).toBe('旧内容\r\n');
  await expect(
    saveRepositoryEdit(repo, { ...request, value: 'other', approval: preview.approval }),
  ).rejects.toMatchObject({ code: 'repositoryEditChanged' });
  await saveRepositoryEdit(repo, { ...request, approval: preview.approval });
  expect(await readFile(path.join(repo, 'guide.md'), 'utf8')).toBe('新内容\r\n');
  expect(await git(repo, 'diff', '--cached', '--name-only')).toBe('');
});

it('edits only the selected JSON value and refuses ambiguous or unsupported fields', async () => {
  const { repo } = await setup();
  const filename = path.join(repo, 'config.json');
  await writeFile(filename, '{ "version": "unchanged", "meta": { "build.version": "1" } }\n');
  const target = { kind: 'json', path: 'config.json', pointer: '/meta/build.version' } as const;
  const before = await inspectRepositoryEdit(repo, target);
  const request = { target, revision: before.revision, value: '2"' };
  const preview = await previewRepositoryEdit(repo, request);
  await saveRepositoryEdit(repo, { ...request, approval: preview.approval });
  expect(await readFile(filename, 'utf8')).toBe(
    '{ "version": "unchanged", "meta": { "build.version": ' + JSON.stringify('2"') + ' } }\n',
  );
  await writeFile(filename, '{"meta": {"build.version": "1", "build.version": "2"}}');
  await expect(inspectRepositoryEdit(repo, target)).rejects.toMatchObject({
    code: 'repositoryEditField',
  });
});

it('synchronizes npm versions and refuses to save either file after a lockfile edit', async () => {
  const { repo } = await setup();
  const manifest = '{"name":"demo","version":"1.0.0"}\n';
  const lock =
    '{"name":"demo","version":"1.0.0","lockfileVersion":3,"packages":{"":{"version":"1.0.0"},"node_modules/dep":{"version":"9.0.0"}}}\n';
  await writeFile(path.join(repo, 'package.json'), manifest);
  await writeFile(path.join(repo, 'package-lock.json'), lock);
  const target = { kind: 'npm' } as const;
  const before = await inspectRepositoryEdit(repo, target);
  const request = { target, revision: before.revision, value: '1.1.0' };
  const preview = await previewRepositoryEdit(repo, request);
  expect(preview.changes.map(({ path, after }) => [path, after])).toEqual([
    ['package.json', manifest.replace('1.0.0', '1.1.0')],
    ['package-lock.json', lock.replaceAll('1.0.0', '1.1.0')],
  ]);
  await writeFile(path.join(repo, 'package-lock.json'), lock + '\n');
  await expect(
    saveRepositoryEdit(repo, { ...request, approval: preview.approval }),
  ).rejects.toMatchObject({ code: 'repositoryEditChanged' });
  expect(await readFile(path.join(repo, 'package.json'), 'utf8')).toBe(manifest);
});

it('rejects paths outside the worktree, ignored files, nested repositories, links and binary data', async () => {
  const { repo, root } = await setup();
  await writeFile(path.join(repo, '.gitignore'), 'ignored.txt\n');
  await writeFile(path.join(repo, 'ignored.txt'), 'ignored');
  await writeFile(path.join(repo, 'binary.txt'), Buffer.from([0, 255]));
  await writeFile(path.join(root, 'outside.txt'), 'outside');
  await link(path.join(root, 'outside.txt'), path.join(repo, 'linked.txt'));
  await mkdir(path.join(repo, 'nested'));
  await git(path.join(repo, 'nested'), 'init');
  await writeFile(path.join(repo, 'nested', 'README.md'), 'nested');
  await symlink(path.join(root, 'outside.txt'), path.join(repo, 'symbolic.txt'), 'file').catch(
    (error: NodeJS.ErrnoException) => {
      if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    },
  );
  for (const name of [
    '../outside.txt',
    '.git/config',
    'ignored.txt',
    'binary.txt',
    'linked.txt',
    'symbolic.txt',
    'nested/README.md',
  ]) {
    await expect(inspectRepositoryEdit(repo, { kind: 'text', path: name })).rejects.toMatchObject({
      code: 'repositoryEditPath',
    });
  }
});

it('rejects a stale preview after a branch switch even if the file is unchanged', async () => {
  const { repo } = await setup();
  const target = { kind: 'text', path: '笔记 example.txt' } as const;
  const before = await inspectRepositoryEdit(repo, target);
  const request = { target, revision: before.revision, value: 'next\n' };
  const preview = await previewRepositoryEdit(repo, request);
  await git(repo, 'switch', '-c', 'different');
  await expect(
    saveRepositoryEdit(repo, { ...request, approval: preview.approval }),
  ).rejects.toMatchObject({ code: 'repositoryEditChanged' });
});

it('supports npm projects without a lockfile and rejects a lockfile added after preview', async () => {
  const { repo } = await setup();
  await writeFile(path.join(repo, 'package.json'), '{"name":"demo","version":"1.0.0"}\n');
  const target = { kind: 'npm' } as const;
  const { revision } = await inspectRepositoryEdit(repo, target);
  await expect(
    previewRepositoryEdit(repo, { target, revision, value: '1.1.0\n' }),
  ).rejects.toMatchObject({ code: 'repositoryEditVersion' });
  const request = { target, revision, value: '1.1.0' };
  const preview = await previewRepositoryEdit(repo, request);
  expect(preview.files.map((file) => file.path)).toEqual(['package.json']);
  await writeFile(path.join(repo, 'package-lock.json'), '{"version":"1.0.0","lockfileVersion":1}');
  await expect(
    saveRepositoryEdit(repo, { ...request, approval: preview.approval }),
  ).rejects.toMatchObject({ code: 'repositoryEditChanged' });
  expect(JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8')).version).toBe('1.0.0');
});

it('synchronizes the npm shrinkwrap version when present', async () => {
  const { repo } = await setup();
  await writeFile(path.join(repo, 'package.json'), '{"name":"demo","version":"1.0.0"}');
  const lock = '{"version":"1.0.0","lockfileVersion":1}';
  await writeFile(path.join(repo, 'npm-shrinkwrap.json'), lock);
  const target = { kind: 'npm' } as const;
  const { revision } = await inspectRepositoryEdit(repo, target);
  const request = { target, revision, value: '1.1.0' };
  const preview = await previewRepositoryEdit(repo, request);
  expect(preview.files.map((file) => file.path)).toEqual(['package.json', 'npm-shrinkwrap.json']);
  await saveRepositoryEdit(repo, { ...request, approval: preview.approval });
  expect(await readFile(path.join(repo, 'npm-shrinkwrap.json'), 'utf8')).toBe(
    lock.replace('1.0.0', '1.1.0'),
  );
});

it('refuses to save when revalidating repository access changes the branch', async () => {
  const { repo } = await setup();
  const target = { kind: 'text', path: '笔记 example.txt' } as const;
  const { revision } = await inspectRepositoryEdit(repo, target);
  const request = { target, revision, value: 'new\n' };
  const preview = await previewRepositoryEdit(repo, request);
  let accessCount = 0;
  await expect(
    saveRepositoryEdit(repo, { ...request, approval: preview.approval }, async () => {
      if (++accessCount === 2) await git(repo, 'switch', '-c', 'different');
    }),
  ).rejects.toMatchObject({ code: 'repositoryEditChanged' });
  expect(await readFile(path.join(repo, target.path), 'utf8')).toBe('first\n');
});
