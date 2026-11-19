import { afterEach, expect, it } from 'vitest';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { performAction, readRepository } from '../server/git.js';
import { commitFile, fixture, git } from './fixtures.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup() {
  const { repo, root, cleanup } = await fixture();
  cleanups.push(cleanup);
  const remote = path.join(root, 'remote.git');
  await git(root, 'init', '--bare', remote);
  const head = await commitFile(repo);
  return { repo, remote, head, expected: { branch: 'main', head, detached: false } };
}

it('adds, publishes and tracks as separate operations without changing the working tree', async () => {
  const { repo, remote, head, expected } = await setup();
  await git(repo, 'push', remote, 'HEAD:refs/heads/existing');
  await performAction(repo, { type: 'addRemote', name: 'team', destination: remote });
  expect((await readRepository(repo)).branches.some((branch) => branch.remote)).toBe(false);
  await writeFile(path.join(repo, 'dirty.txt'), 'not for publication');
  await performAction(repo, { type: 'publishBranch', remote: 'team', name: 'features/new', expected });
  expect(await git(remote, 'rev-parse', 'refs/heads/features/new')).toBe(head);
  expect((await readRepository(repo)).upstream).toBeNull();
  await expect(performAction(repo, { type: 'push' })).rejects.toMatchObject({ code: 'noUpstream' });
  await performAction(repo, { type: 'fetch' });
  await performAction(repo, {
    type: 'setTracking', targetRef: 'refs/remotes/team/features/new', targetHash: head, expected,
  });
  expect((await readRepository(repo)).upstream).toBe('team/features/new');
  expect(await git(repo, 'status', '--porcelain')).toBe('?? dirty.txt');
  expect(await git(repo, 'rev-parse', 'HEAD')).toBe(head);
});

it('cannot publish over an undiscovered remote branch, even at the same commit', async () => {
  const { repo, remote, head, expected } = await setup();
  await git(repo, 'remote', 'add', 'team', remote);
  await git(repo, 'push', remote, 'HEAD:refs/heads/shared');
  const action = { type: 'publishBranch' as const, remote: 'team', name: 'shared', expected };
  await expect(performAction(repo, action)).rejects.toMatchObject({ code: 'remoteBranchExists' });
  const next = await commitFile(repo, 'next.txt');
  await expect(performAction(repo, { ...action, expected: { ...expected, head: next } })).rejects.toMatchObject({ code: 'remoteBranchExists' });
  expect(await git(remote, 'rev-parse', 'refs/heads/shared')).toBe(head);
});

it('ordinary push does not push tags, overwrite history or recreate a deleted upstream', async () => {
  const { repo, remote, head } = await setup();
  await git(repo, 'remote', 'add', 'team', remote);
  await git(repo, 'push', '-u', 'team', 'HEAD:refs/heads/destination');
  await git(repo, 'config', 'push.followTags', 'true');
  const advanced = await commitFile(repo, 'forward.txt');
  await git(repo, 'tag', '-a', 'release', '-m', 'do not push');
  await performAction(repo, { type: 'push' });
  expect(await git(remote, 'rev-parse', 'refs/heads/destination')).toBe(advanced);
  expect(await git(remote, 'tag', '--list')).toBe('');
  await git(repo, 'reset', '--hard', head);
  await expect(performAction(repo, { type: 'push' })).rejects.toMatchObject({ code: 'pushNonFastForward' });
  await git(remote, 'update-ref', '-d', 'refs/heads/destination');
  await git(repo, 'reset', '--hard', advanced);
  await expect(performAction(repo, { type: 'push' })).rejects.toMatchObject({ code: 'pushNeedsFetch' });
  expect(await git(remote, 'for-each-ref', 'refs/heads')).toBe('');
  await performAction(repo, { type: 'fetch' });
  await expect(performAction(repo, { type: 'pull' })).rejects.toMatchObject({ code: 'upstreamUnavailable' });
});

it('stale confirmation and multiple push addresses are rejected without publishing', async () => {
  const { repo, remote, expected } = await setup();
  await git(repo, 'remote', 'add', 'team', remote);
  await git(repo, 'remote', 'set-url', '--add', '--push', 'team', remote);
  await git(repo, 'remote', 'set-url', '--add', '--push', 'team', remote);
  const action = { type: 'publishBranch' as const, remote: 'team', name: 'new', expected };
  await expect(performAction(repo, action)).rejects.toMatchObject({
    code: 'multiplePushDestinations',
  });
  await commitFile(repo, 'next.txt');
  await expect(performAction(repo, action)).rejects.toMatchObject({ code: 'branchStateChanged' });
  expect(await git(remote, 'for-each-ref', 'refs/heads')).toBe('');
});
