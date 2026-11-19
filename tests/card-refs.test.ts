import { expect, test } from 'vitest';
import { cardUsesWorktree, relationRefs } from '../shared/card-refs';

test('only HEAD and the checked-out local branch represent the working tree', () => {
  const current = { branch: 'main', detached: false };
  expect(cardUsesWorktree(undefined, { ...current, detached: true })).toBe(true);
  expect(cardUsesWorktree('refs/heads/main', current)).toBe(true);
  expect(cardUsesWorktree('refs/remotes/origin/main', current)).toBe(false);
  expect(cardUsesWorktree('refs/heads/main', { ...current, detached: true })).toBe(false);
  expect(cardUsesWorktree('refs/heads/dev', current)).toBe(false);
});

test('relations inherit card references until explicitly overridden', () => {
  const nodes = [
    { id: 'remote', ref: 'refs/remotes/origin/main' },
    { id: 'local', ref: 'refs/heads/main' },
  ];
  expect(relationRefs({ source: 'remote', target: 'local' }, nodes)).toEqual({
    sourceRef: 'refs/remotes/origin/main',
    targetRef: 'refs/heads/main',
  });
  expect(
    relationRefs({ source: 'remote', target: 'local', sourceRef: 'HEAD' }, nodes).sourceRef,
  ).toBe('HEAD');
});
