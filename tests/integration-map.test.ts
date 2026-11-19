import { expect, it } from 'vitest';
import { integrationMap } from '../src/lib/integration-map';
import type { Commit, IntegrationHistory } from '../shared/types';

const c = (hash: string, parents: string[] = []): Commit => ({
  hash,
  parents,
  shortHash: hash,
  subject: hash,
  author: '',
  date: '',
  refs: '',
});
const comparison: IntegrationHistory['comparison'] = {
  state: 'pending',
  sourceHead: null,
  targetHead: null,
  pending: 0,
  message: '',
};
it('目标停在共同版本时，目标最新提交仍位于目标列且只保留一个真实节点', () => {
  const base = c('C'),
    next = c('D', ['C']),
    tip = c('E', ['D']);
  const history: IntegrationHistory = {
    comparison,
    shallow: false,
    sourceTip: tip,
    targetTip: base,
    includedAt: null,
    commonBases: [base],
    sourceOnly: { commits: [tip, next], total: 2, hasMore: false },
    targetOnly: { commits: [], total: 0, hasMore: false },
  };
  const map = integrationMap(history, { source: 23, target: 77 });
  expect(map.nodes.find((node) => node.commit.hash === 'C')?.x).toBe(77);
  expect(map.nodes.find((node) => node.commit.hash === 'C')?.kind).toBe('common');
  expect(map.nodes).toHaveLength(3);
  expect(map.edges.map((edge) => [edge.child, edge.parent, edge.x1, edge.x2])).toEqual([
    ['E', 'D', 23, 23],
    ['D', 'C', 23, 77],
  ]);
  const equal = integrationMap({
    ...history,
    sourceTip: base,
    sourceOnly: { commits: [], total: 0, hasMore: false },
  });
  expect(equal.nodes).toHaveLength(1);
  expect(equal.edges).toHaveLength(0);
});
it('合并节点位于双方父提交上方，仅连接真实父子，去重共同提交', () => {
  const base = c('base'),
    source = c('public', ['base']),
    target = c('private', ['base']),
    merge = c('merge', ['private', 'public']);
  const map = integrationMap({
    comparison,
    shallow: false,
    sourceTip: source,
    targetTip: merge,
    includedAt: merge,
    commonBases: [source],
    sourceOnly: { commits: [], total: 0, hasMore: false },
    targetOnly: { commits: [merge, target], total: 2, hasMore: false },
  } as IntegrationHistory);
  expect(map.nodes.filter((n) => n.commit.hash === 'public')).toHaveLength(1);
  const row = (hash: string) => map.nodes.findIndex((n) => n.commit.hash === hash);
  expect(row('merge')).toBeLessThan(row('private'));
  expect(row('merge')).toBeLessThan(row('public'));
  expect(map.edges.map((e) => `${e.child}-${e.parent}`).sort()).toEqual([
    'merge-private',
    'merge-public',
  ]);
  expect(map.nodes.find((n) => n.commit.hash === 'public')?.kind).toBe('common');
  expect(base.hash).toBe('base');
});
it('双轨分别汇入真实共同祖先，缺失父节点只标为历史边界', () => {
  const base = c('base'),
    source = c('public', ['missing']),
    target = c('private', ['base']);
  const map = integrationMap({
    comparison,
    shallow: false,
    sourceTip: source,
    targetTip: target,
    includedAt: null,
    commonBases: [base],
    sourceOnly: { commits: [source], total: 2, hasMore: true },
    targetOnly: { commits: [target], total: 1, hasMore: false },
  } as IntegrationHistory);
  expect(map.edges.map((e) => `${e.child}-${e.parent}`)).toEqual(['private-base']);
  expect(map.nodes.find((n) => n.commit.hash === 'public')?.boundary).toBe(true);
});
it('C、D、M、T 局部图只连接真实父边，不补画范围外的 S', () => {
  const base = c('C', ['B']),
    source = c('D', ['C']),
    merge = c('M', ['S', 'C']),
    target = c('T', ['M']);
  const map = integrationMap({
    comparison,
    shallow: false,
    sourceTip: source,
    targetTip: target,
    includedAt: null,
    commonBases: [base],
    sourceOnly: { commits: [source], total: 1, hasMore: false },
    targetOnly: { commits: [target, merge], total: 2, hasMore: false },
  });
  expect(map.nodes.map((node) => node.commit.hash).sort()).toEqual(['C', 'D', 'M', 'T']);
  expect(map.edges.map((edge) => `${edge.child}-${edge.parent}`).sort()).toEqual([
    'D-C',
    'M-C',
    'T-M',
  ]);
});
