import type { Commit, IntegrationHistory } from '../../shared/types';

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
    return {
      ...entry,
      row,
      // A target tip can itself be the common base when the source has advanced.
      // Keep that real node in the target column instead of leaving it empty.
      x:
        entry.kind === 'target' || hash === history.targetTip?.hash
          ? columns.target
          : columns.source,
      boundary:
        entry.kind !== 'common' && entry.commit.parents.some((parent) => !entries.has(parent)),
    };
  });
  const edges = nodes.flatMap((node) =>
    node.commit.parents.flatMap((parent) => {
      const ancestor = nodes.find((candidate) => candidate.commit.hash === parent);
      return ancestor
        ? [
            {
              child: node.commit.hash,
              parent,
              x1: node.x,
              y1: node.row * 56 + 28,
              x2: ancestor.x,
              y2: ancestor.row * 56 + 28,
            },
          ]
        : [];
    }),
  );
  return { nodes, edges, height: Math.max(56, nodes.length * 56) };
}
