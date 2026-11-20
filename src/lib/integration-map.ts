import type { Commit, IntegrationHistory } from '../../shared/types';
import { commitGraphPath } from './commit-graph-path';

const rowHeight = 56;

export function integrationMap(history: IntegrationHistory, columns = { source: 25, target: 75 }) {
  const entries = new Map<string, { commit: Commit; kind: 'source' | 'target' | 'common' }>();
  for (const commit of history.sourceOnly.commits)
    entries.set(commit.hash, { commit, kind: 'source' });
  for (const commit of history.targetOnly.commits)
    entries.set(commit.hash, { commit, kind: 'target' });
  for (const commit of history.commonBases) entries.set(commit.hash, { commit, kind: 'common' });
  const children = new Map<string, number>();
  for (const hash of entries.keys()) children.set(hash, 0);
  for (const { commit } of entries.values())
    for (const parent of commit.parents)
      if (entries.has(parent)) children.set(parent, children.get(parent)! + 1);
  const queue = [...entries.keys()].filter((hash) => !children.get(hash));
  const ordered: string[] = [];
  while (queue.length) {
    const hash = queue.shift()!;
    ordered.push(hash);
    for (const parent of entries.get(hash)!.commit.parents) {
      if (!entries.has(parent)) continue;
      children.set(parent, children.get(parent)! - 1);
      if (!children.get(parent)) queue.push(parent);
    }
  }
  const nodes = ordered.map((hash, row) => {
    const entry = entries.get(hash)!;
    const lane = entry.kind === 'target' || hash === history.targetTip?.hash ? 'target' : 'source';
    return {
      ...entry,
      row,
      // A target tip can itself be the common base when the source has advanced.
      // Keep that real node in the target column instead of leaving it empty.
      lane,
      x: columns[lane],
      y: (row + 0.5) * rowHeight,
      boundary:
        entry.kind !== 'common' && entry.commit.parents.some((parent) => !entries.has(parent)),
    };
  });
  const edges = nodes.flatMap((node) =>
    node.commit.parents.flatMap((parent) => {
      const ancestor = nodes.find((candidate) => candidate.commit.hash === parent);
      if (!ancestor) return [];
      const between = nodes.slice(node.row + 1, ancestor.row);
      const track =
        node.lane === ancestor.lane || !between.some((commit) => commit.lane === node.lane)
          ? node.x
          : !between.some((commit) => commit.lane === ancestor.lane)
            ? ancestor.x
            : (node.x + ancestor.x) / 2;
      return [{ child: node.commit.hash, parent, path: commitGraphPath(node, ancestor, track) }];
    }),
  );
  const laneWidth = Math.min(
    columns.source * 2,
    (100 - columns.target) * 2,
    columns.target - columns.source,
  );
  return {
    nodes,
    edges,
    columns,
    laneWidth,
    height: Math.max(rowHeight, nodes.length * rowHeight),
  };
}
