import { link, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectDelivery } from '../server/assistant-project.js';
import { fixture, git } from './fixtures.js';
import { LocalServices } from '../server/local-service.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const model = { endpoint: 'http://127.0.0.1:8888/v1/chat/completions', model: 'fixture' };
const input = {
  repositoryId: 'repo',
  ...model,
  prompt: 'Generate a local launch script',
  approved: true,
};
const newFile = { path: 'scripts/dev.ps1', content: "& node 'server.js'\nexit $LASTEXITCODE\n" };
const target = { kind: 'powershell', entry: newFile.path, directory: '.', port: 8090 };

async function setup(outputs: unknown[], onRequest?: () => void) {
  const { root, repo, cleanup } = await fixture();
  const approval = { ...input, repositoryPath: repo };
  const services = new LocalServices(path.join(root, 'data'));
  cleanups.push(cleanup, () => services.close());
  await mkdir(path.join(repo, 'scripts'));
  await writeFile(path.join(repo, 'README.md'), '# Example\n');
  await writeFile(path.join(repo, '.env'), 'TOKEN=never-send-this');
  await writeFile(path.join(repo, '.gitignore'), 'ignored.txt\n');
  await writeFile(path.join(repo, 'ignored.txt'), 'ignore-me');
  const requests: string[] = [];
  const settings = { ...model, key: 'revision-one', enabled: true };
  const repository = { id: 'repo', path: repo, name: 'Example', archived: false };
  const delivery = new ProjectDelivery({
    repository: async () => repository,
    settings: async () => settings,
    complete: async (_settings, messages) => {
      requests.push(JSON.stringify(messages));
      onRequest?.();
      return JSON.stringify(outputs.shift());
    },
    services,
  });
  return { repo, root, delivery, services, requests, settings, approval, repository };
}

it('does not disclose more content after the selected repository is archived', async () => {
  const archive = vi.fn();
  const { delivery, approval, requests, repository } = await setup(
    [{ read: ['README.md'] }, { summary: 'Ready', files: [newFile] }],
    archive,
  );
  archive.mockImplementation(() => {
    repository.archived = true;
  });
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectChanged' });
  expect(requests).toHaveLength(1);
});

it.skipIf(process.platform !== 'win32')(
  'does not bind running permissions to a branch switched during configuration',
  async () => {
    const { repo, delivery, approval, services } = await setup([
      { summary: 'Ready', files: [newFile], service: target },
    ]);
    const plan = await delivery.prepare(approval);
    const save = services.save.bind(services);
    vi.spyOn(services, 'save').mockImplementation(async (...args) => {
      await git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/other');
      return save(...args);
    });
    expect(await delivery.apply(plan.id, { configure: true, trusted: true })).toMatchObject({
      written: [newFile.path],
      configured: false,
      error: { code: 'localServiceReview' },
    });
    expect((await services.state(repo)).config).toBeNull();
  },
);

it('lists safe files, reads only requested text, and applies only a reviewed plan once', async () => {
  const { repo, delivery, requests, approval } = await setup([
    { read: ['README.md'] },
    { summary: 'Ready', files: [newFile, { path: 'README.md', content: '# Updated\n' }] },
  ]);
  const plan = await delivery.prepare(approval);
  expect(plan.read).toEqual(['README.md']);
  expect(requests[0]).toContain('README.md');
  expect(requests[0]).not.toContain('# Example');
  expect(requests.join()).not.toMatch(/\.env|ignored\.txt|never-send-this/);
  expect(requests[1]).toContain('# Example');
  expect(await readFile(path.join(repo, 'README.md'), 'utf8')).toBe('# Example\n');
  await expect(readFile(path.join(repo, newFile.path))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await delivery.apply(plan.id, { configure: false })).toMatchObject({
    written: [newFile.path, 'README.md'],
    configured: false,
  });
  expect(await readFile(path.join(repo, newFile.path), 'utf8')).toBe(newFile.content);
  expect(await readFile(path.join(repo, 'README.md'), 'utf8')).toBe('# Updated\n');
  await expect(delivery.apply(plan.id, { configure: false })).rejects.toMatchObject({
    code: 'projectPlanMissing',
  });
});

it('rejects unapproved providers and disables both preparation and application when access is off', async () => {
  const { delivery, requests, settings, approval, root } = await setup([
    { summary: 'Ready', files: [newFile] },
  ]);
  await expect(delivery.prepare({ ...approval, model: 'other' })).rejects.toMatchObject({
    code: 'projectChanged',
  });
  await expect(delivery.prepare({ ...approval, repositoryPath: root })).rejects.toMatchObject({
    code: 'projectChanged',
  });
  expect(requests).toHaveLength(0);
  const plan = await delivery.prepare(approval);
  settings.enabled = false;
  await expect(delivery.apply(plan.id, { configure: false })).rejects.toMatchObject({
    code: 'projectDisabled',
  });
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectDisabled' });
});

it('detects edits made after review before writing any file', async () => {
  const { repo, delivery, approval } = await setup([
    { read: ['README.md'] },
    { summary: 'Ready', files: [newFile, { path: 'README.md', content: '# Updated\n' }] },
  ]);
  const plan = await delivery.prepare(approval);
  await writeFile(path.join(repo, 'README.md'), '# User wrote this\n');
  await expect(delivery.apply(plan.id, { configure: false })).rejects.toMatchObject({
    code: 'projectChanged',
  });
  expect(await readFile(path.join(repo, 'README.md'), 'utf8')).toBe('# User wrote this\n');
  await expect(readFile(path.join(repo, newFile.path))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([
  '../outside.txt',
  'C:/outside.txt',
  'scripts/NUL.txt',
  '.git/hooks/run.ps1',
  'credentials.json',
  'ignored.txt',
])('rejects a proposed target outside the allowed scope: %s', async (unsafe) => {
  const { delivery, approval } = await setup([
    { summary: 'Unsafe', files: [{ ...newFile, path: unsafe }] },
  ]);
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectPath' });
});

it('does not send content from a directory junction', async () => {
  const { root, repo, delivery, requests, approval } = await setup([
    { read: ['external/secret.txt'] },
  ]);
  const external = path.join(root, 'external');
  await mkdir(external);
  await writeFile(path.join(external, 'secret.txt'), 'private contents');
  await symlink(external, path.join(repo, 'external'), 'junction');
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectPath' });
  expect(requests.join()).not.toContain('private contents');
});

it('rejects known credential contents and does not forward them to the model', async () => {
  const { repo, delivery, requests, approval } = await setup([{ read: ['settings.json'] }]);
  await writeFile(
    path.join(repo, 'settings.json'),
    JSON.stringify({ apiKey: 'never-forward-this' }),
  );
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectPath' });
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toContain('never-forward-this');
});

it('rejects hard-linked files even when the visible path is inside the repository', async () => {
  const { root, repo, delivery, requests, approval } = await setup([{ read: ['shared.txt'] }]);
  const source = path.join(root, 'outside.txt');
  await writeFile(source, 'outside text');
  await link(source, path.join(repo, 'shared.txt'));
  await expect(delivery.prepare(approval)).rejects.toMatchObject({ code: 'projectPath' });
  expect(requests.join()).not.toContain('shared.txt');
});

it.skipIf(process.platform !== 'win32')(
  'uses explicit trust to save the generated entry without starting it',
  async () => {
    const { repo, delivery, services, approval } = await setup([
      { summary: 'Ready', files: [newFile], service: target },
    ]);
    const plan = await delivery.prepare(approval);
    await expect(delivery.apply(plan.id, { configure: true })).rejects.toMatchObject({
      code: 'projectInvalid',
    });
    expect(await delivery.apply(plan.id, { configure: true, trusted: true })).toEqual({
      written: [newFile.path],
      configured: true,
    });
    expect(await services.state(repo)).toMatchObject({
      status: 'stopped',
      config: target,
      log: '',
    });
  },
);
