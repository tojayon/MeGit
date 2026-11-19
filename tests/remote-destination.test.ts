import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { remoteDestination } from '../server/remote-destination.js';

const repository = path.resolve('work', 'source');

test('builds an HTTPS GitHub branch link without exposing credentials', () => {
  expect(remoteDestination(repository, 'git@github.com:owner/repo.git', 'feature/topic')).toEqual({
    kind: 'web',
    value: 'https://github.com/owner/repo/tree/feature%2Ftopic',
  });
  expect(
    remoteDestination(repository, 'https://token@github.com/owner/repo.git', 'main'),
  ).toBeUndefined();
  expect(
    remoteDestination(repository, 'https://other.example/owner/repo.git', 'main'),
  ).toBeUndefined();
});

test('returns local remotes as paths, not clickable URLs', () => {
  const destination = path.resolve(repository, '../bare repo.git');
  for (const address of ['../bare repo.git', pathToFileURL(destination).href]) {
    expect(remoteDestination(repository, address, 'main')).toEqual({
      kind: 'local',
      value: destination,
    });
  }
});
