import { describe, expect, it } from 'vitest';
import type { BranchTreeData, Commit, TreeBranch } from '../shared/types';
import { buildBranchTree } from '../src/lib/branch-tree';

const commit = (hash: string, parents: string[] = []): Commit => ({
  hash,
  parents,
  shortHash: hash,
  author: 'Example',
  date: '2026-01-01T00:00:00Z',
  subject: hash,
  refs: '',
});
const branch = (name: string, hash: string): TreeBranch => ({
  ref: 'refs/heads/' + name,
  name,
  hash,
  parents: [],
  subject: hash,
  author: 'Example',
  date: '',
  current: false,
  remote: false,
  upstream: null,
  upstreamGone: false,
  ahead: null,
  behind: null,
});
function data(commits: Commit[], branches: TreeBranch[]): BranchTreeData {
  return {
    commits,
    branches,
    baseRef: branches[0]?.ref || null,
    head: branches[0]?.hash || null,
    currentRef: branches[0]?.ref || null,
    detached: false,
    hasMore: false,
    limit: 120,
    shallow: false,
    checkedAt: '',
  };
}

describe('分支树使用真实 DAG 的向上布局', () => {
  it('合并后删除功能分支引用，压缩历史仍保留可见的分叉与合流', () => {
    const commits = [commit('r')];
    for (let i = 1; i <= 36; i++) commits.push(commit('a' + i, [i === 1 ? 'r' : 'a' + (i - 1)]));
    commits.push(commit('b1', ['r']), commit('b2', ['b1']), commit('m', ['a36', 'b2']));
    const graph = data(commits, [branch('main', 'm')]);
    const layout = buildBranchTree(graph);
    expect(layout.nodes.some((node) => node.lane !== 0)).toBe(true);
    const parents = layout.edges.filter((edge) => edge.child === 'm');
    expect(parents).toHaveLength(2);
    expect(new Set(parents.map((edge) => edge.path)).size).toBe(2);
    expect(layout.edges.some((edge) => edge.merge)).toBe(true);
  });
  it('首父树干居中，父节点在子节点下方，分叉与第二父合流均保留', () => {
    const graph = data(
      [commit('m', ['a', 'b']), commit('a', ['r']), commit('b', ['r']), commit('r')],
      [branch('main', 'm'), branch('feature', 'b')],
    );
    const tree = buildBranchTree(graph);
    expect(tree.nodes).toHaveLength(4);
    const nodes = new Map(tree.nodes.map((node) => [node.commit.hash, node]));
    for (const hash of ['m', 'a', 'r']) expect(nodes.get(hash)?.x).toBe(tree.width / 2);
    expect(nodes.get('b')?.x).not.toBe(tree.width / 2);
    for (const edge of tree.edges) {
      expect(nodes.get(edge.parent)!.y).toBeGreaterThan(nodes.get(edge.child)!.y);
      expect(edge.path).toMatch(/^M/);
    }
    expect(tree.edges).toHaveLength(4);
    expect(tree.edges.find((edge) => edge.child === 'm' && edge.parent === 'b')?.merge).toBe(true);
  });

  it('同一提交上的多个引用共用节点，不强连不同根', () => {
    const graph = data(
      [commit('a', ['r']), commit('r'), commit('other')],
      [branch('main', 'a'), branch('alias', 'a'), branch('unrelated', 'other')],
    );
    const tree = buildBranchTree(graph);
    expect(tree.nodes.find((node) => node.commit.hash === 'a')?.branches).toHaveLength(2);
    expect(tree.nodes).toHaveLength(3);
    expect(tree.edges).toHaveLength(1);
    expect(tree.roots).toHaveLength(2);
  });

  it('缺失父节点显示边界，不能虚构到树干的连线', () => {
    const graph = data(
      [commit('new', ['missing']), commit('old')],
      [branch('main', 'new'), branch('old', 'old')],
    );
    graph.hasMore = true;
    const tree = buildBranchTree(graph);
    expect(tree.boundaries).toHaveLength(1);
    expect(tree.boundaries[0].parent).toBe('missing');
    expect(tree.edges).toHaveLength(0);
    expect(tree.nodes.find((node) => node.commit.hash === 'new')?.boundary).toBe(true);
  });

  it('长线性历史默认折叠，可展开而不丢失实际提交', () => {
    const commits = Array.from({ length: 80 }, (_, i) =>
      commit(String(i), i ? [String(i - 1)] : []),
    );
    const graph = data(commits, [branch('main', '79')]);
    const compact = buildBranchTree(graph);
    expect(compact.nodes.length).toBeLessThan(10);
    expect(compact.edges.flatMap((edge) => edge.via)).toHaveLength(78);
    const expanded = buildBranchTree(graph, { expanded: true });
    expect(expanded.nodes).toHaveLength(80);
    expect(expanded.edges).toHaveLength(79);
  });

  it('更换树干改变布局，不改变原始数据、引用和真实边', () => {
    const graph = data(
      [commit('a', ['r']), commit('b', ['r']), commit('r')],
      [branch('main', 'a'), branch('feature', 'b')],
    );
    const before = JSON.stringify(graph);
    const first = buildBranchTree(graph);
    const second = buildBranchTree({ ...graph, baseRef: 'refs/heads/feature' });
    expect(second.nodes.find((node) => node.commit.hash === 'b')?.x).toBe(second.width / 2);
    expect(first.nodes.find((node) => node.commit.hash === 'b')?.x).not.toBe(first.width / 2);
    expect(JSON.stringify(graph)).toBe(before);
    expect(second.edges.map((edge) => [edge.child, edge.parent]).sort()).toEqual(
      first.edges.map((edge) => [edge.child, edge.parent]).sort(),
    );
  });
});
