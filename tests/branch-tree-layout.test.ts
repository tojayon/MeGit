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
  it('转角与直线以及相邻曲段的曲率连续，避免接缝突然折转', () => {
    for (const continued of [false, true]) {
      const commits = [commit('r'), commit('b', ['r'])];
      for (let i = 1; i <= 6; i++) commits.push(commit('a' + i, [i === 1 ? 'r' : 'a' + (i - 1)]));
      commits.push(commit('m', ['a6', 'b']));
      if (continued) commits.push(commit('next', ['b']));
      const tree = buildBranchTree(
        data(commits, [branch('main', 'm'), branch('feature', continued ? 'next' : 'b')]),
      );
      let curves = 0;
      for (const edge of tree.edges) {
        let point = [0, 0];
        const segments: { start: number; end: number }[] = [{ start: 0, end: 0 }];
        for (const command of edge.path.matchAll(/([MCV])([^MCV]*)/g)) {
          const v = command[2].trim().split(/[ ,]+/).map(Number);
          if (command[1] === 'M') point = v;
          if (command[1] === 'V') {
            segments.push({ start: 0, end: 0 });
            point = [point[0], v[0]];
          }
          if (command[1] === 'C') {
            const p = [point, v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)];
            const curvature = (end: boolean) => {
              const d = end
                ? p[3].map((n, i) => 3 * (n - p[2][i]))
                : p[1].map((n, i) => 3 * (n - p[0][i]));
              const dd = end
                ? p[3].map((n, i) => 6 * (n - 2 * p[2][i] + p[1][i]))
                : p[2].map((n, i) => 6 * (n - 2 * p[1][i] + p[0][i]));
              return (d[0] * dd[1] - d[1] * dd[0]) / Math.hypot(...d) ** 3;
            };
            segments.push({ start: curvature(false), end: curvature(true) });
            point = p[3];
            curves++;
          }
        }
        segments.push({ start: 0, end: 0 });
        for (let i = 1; i < segments.length; i++)
          expect(Math.abs(segments[i - 1].end - segments[i].start)).toBeLessThan(1e-8);
      }
      expect(curves).toBeGreaterThan(0);
    }
  });
});
