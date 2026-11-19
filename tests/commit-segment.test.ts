import { describe, expect, it } from 'vitest';
import type { Commit } from '../shared/types';
import { commitSegment } from '../src/lib/commit-segment';

const commit = (hash: string, parents: string[]): Commit => ({
  hash,
  parents,
  shortHash: hash,
  subject: hash,
  author: 'Example',
  date: '',
  refs: '',
});

describe('折叠段局部历史', () => {
  it('按真实父关系从新到旧返回隐藏提交和两端上下文，保留原始事件', () => {
    const commits = [
      commit('root', []),
      commit('a', ['root']),
      commit('b', ['a']),
      commit('merge', ['b', 'other']),
    ];
    expect(commitSegment(commits, { child: 'merge', via: ['b', 'a'], parent: 'root' })).toEqual([
      commits[3],
      commits[2],
      commits[1],
      commits[0],
    ]);
    expect(commits[3].parents).toEqual(['b', 'other']);
  });
  it('数据缺失、重复或已不相连时不拼接虚构历史', () => {
    const commits = [commit('a', []), commit('b', ['a'])];
    expect(commitSegment(commits, { child: 'b', via: ['missing'], parent: 'a' })).toEqual([]);
    expect(commitSegment(commits, { child: 'b', via: ['b'], parent: 'a' })).toEqual([]);
    expect(commitSegment(commits, { child: 'a', via: [], parent: 'b' })).toEqual([]);
  });
});
