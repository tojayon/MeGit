import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { performAction } from '../server/git.js';
import { checkRemoteRead, githubLoginAvailable, loginRemoteGitHub, remoteReadFailure } from '../server/remote-access.js';
import { fixture, git } from './fixtures.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

it('checks an empty local remote without fetching or creating tracking refs', async () => {
  const { repo, root, cleanup } = await fixture();
  cleanups.push(cleanup);
  const target = path.join(root, 'read test.git');
  await git(root, 'init', '--bare', target);
  await git(repo, 'remote', 'add', 'origin', target);
  expect(await checkRemoteRead(repo, 'origin')).toEqual({ status: 'readable' });
  expect(await git(repo, 'for-each-ref', 'refs/remotes')).toBe('');
  await expect(git(repo, 'rev-parse', '--verify', 'FETCH_HEAD')).rejects.toThrow();
  expect(await checkRemoteRead(repo, 'removed')).toEqual({ status: 'remoteNotConfigured' });
  await git(repo, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  expect(await checkRemoteRead(repo, 'origin')).toEqual({ status: 'remoteReadLocal' });
  await expect(loginRemoteGitHub(repo, 'origin')).rejects.toMatchObject({ code: 'remoteGitHubOnly' });
});

it('offers browser login only for clean GitHub.com HTTPS fetch addresses', async () => {
  const { repo, cleanup } = await fixture();
  cleanups.push(cleanup);
  await git(repo, 'remote', 'add', 'origin', 'https://github.com/example/repository.git');
  expect(await githubLoginAvailable(repo, 'origin')).toEqual({ githubLogin: true });
  await git(repo, 'config', 'url.ssh://git@github.com/.insteadOf', 'https://github.com/');
  expect(await githubLoginAvailable(repo, 'origin')).toEqual({ githubLogin: false });
  await git(repo, 'remote', 'set-url', 'origin', 'https://github.com.example.invalid/example/repository.git');
  expect(await githubLoginAvailable(repo, 'origin')).toEqual({ githubLogin: false });
  await expect(performAction(repo, {
    type: 'addRemote', name: 'unsafe', destination: 'https://example:secret@example.invalid/repo.git',
  })).rejects.toMatchObject({ code: 'remoteDestinationCredentials' });
  expect(await git(repo, 'remote')).toBe('origin');
});

it('distinguishes explicit authentication and network failures from ambiguous access', () => {
  expect(remoteReadFailure('fatal: could not read Username: terminal prompts disabled')).toBe('remoteReadAuth');
  expect(remoteReadFailure('git@github.com: Permission denied (publickey).')).toBe('remoteReadAuth');
  expect(remoteReadFailure('Could not resolve host: example.invalid')).toBe('remoteReadNetwork');
  expect(remoteReadFailure('ERROR: Repository not found.')).toBe('remoteReadUnknown');
  expect(remoteReadFailure('The requested URL returned error: 403')).toBe('remoteReadUnknown');
});
