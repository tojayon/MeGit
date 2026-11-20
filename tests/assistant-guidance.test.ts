import { expect, it } from 'vitest';
import {
  availableAssistantGuides,
  defaultAssistantGuides,
  filterAssistantGuides,
} from '../shared/assistant-guidance';
import type { RepoState } from '../shared/types';
const base: RepoState = {
  branch: 'main',
  head: 'a'.repeat(40),
  detached: false,
  upstream: null,
  ahead: null,
  behind: null,
  changed: 0,
  staged: 0,
  files: [],
  branches: [],
  remotes: [],
  fetchedAt: null,
  checkedAt: '',
};
it('用真实仓库状态提供引导，去重、过滤越界与过期动作', () => {
  expect(defaultAssistantGuides(base)).toEqual(['addRemote']);
  expect(availableAssistantGuides(base)).not.toContain('publishBranch');
  expect(
    filterAssistantGuides(
      [
        { repositoryId: 'one', kind: 'addRemote' },
        { repositoryId: 'one', kind: 'addRemote' },
        { repositoryId: 'outside', kind: 'worktree' },
        { repositoryId: 'one', kind: 'setTracking' },
      ],
      new Map([['one', base]]),
    ),
  ).toEqual([{ repositoryId: 'one', kind: 'addRemote' }]);
  expect(defaultAssistantGuides({ ...base, remotes: ['origin'] })).toEqual([
    'fetch',
    'publishBranch',
  ]);
  expect(
    defaultAssistantGuides({ ...base, remotes: ['origin'], trackingConfigured: true }),
  ).toEqual(['fetch']);
  expect(defaultAssistantGuides({ ...base, detached: true })).toEqual(['branches']);
  expect(defaultAssistantGuides({ ...base, operation: 'merge' })).toEqual(['worktree']);
  expect(availableAssistantGuides({ ...base, error: 'missing' })).toEqual([]);
});

it('已配置跟踪仍可引导获取，冲突时也可读取远端', () => {
  const state = {
    ...base,
    remotes: ['origin'],
    upstream: 'origin/main',
    upstreamHead: base.head,
    trackingConfigured: true,
  };
  expect(availableAssistantGuides(state)).toContain('fetch');
  expect(availableAssistantGuides({ ...state, operation: 'merge' })).toContain('fetch');
  expect(defaultAssistantGuides(state)).toEqual([]);
});

it('冲突与进行中操作优先引导工作区，不提供跟踪或发布写入口', () => {
  const state: RepoState = {
    ...base,
    remotes: ['origin'],
    files: [
      { path: 'a.txt', indexStatus: 'U', worktreeStatus: 'U', untracked: false, conflicted: true },
    ],
  };
  expect(defaultAssistantGuides(state)).toEqual(['worktree']);
  expect(availableAssistantGuides(state)).not.toContain('publishBranch');
  expect(availableAssistantGuides(state)).not.toContain('setTracking');
  expect(availableAssistantGuides(state)).toContain('fetch');
  const guides = Array.from({ length: 21 }, (_, i) => ({
    repositoryId: String(i),
    kind: 'worktree' as const,
  }));
  expect(filterAssistantGuides(guides, new Map([['0', state]]))).toEqual([guides[0]]);
});
