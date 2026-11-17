import type { BranchTreeData, Commit, TreeBranch } from '../../shared/types';

export interface TreeNode {
  commit: Commit;
  branches: TreeBranch[];
  x: number;
  y: number;
  lane: number;
  onTrunk: boolean;
  boundary: boolean;
}
export interface TreeEdge {
  parent: string;
  child: string;
  path: string;
  via: string[];
  merge: boolean;
  trunk: boolean;
}
export interface TreeBoundary {
  child: string;
  parent: string;
  x: number;
  y: number;
}
export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  boundaries: TreeBoundary[];
  roots: string[];
  width: number;
  height: number;
  collapsed: number;
}

export function treeRefHash(data: BranchTreeData, ref: string | null) {
  return ref === 'HEAD'
    ? data.head
    : data.branches.find((branch) => branch.ref === ref)?.hash || null;
}

export function treeAncestors(data: BranchTreeData, hash: string | null): Set<string> {
  const commits = new Map(data.commits.map((commit) => [commit.hash, commit]));
  const visited = new Set<string>();
  const pending = hash ? [hash] : [];
  while (pending.length) {
    const next = pending.pop()!;
    if (visited.has(next)) continue;
    visited.add(next);
    pending.push(...(commits.get(next)?.parents || []));
  }
  return visited;
}

export function buildBranchTree(
  data: BranchTreeData,
  options: { expanded?: boolean } = {},
): TreeLayout {
  const commits = new Map(data.commits.map((commit) => [commit.hash, commit]));
  const references = new Map<string, TreeBranch[]>();
  const children = new Map<string, string[]>();
  for (const branch of data.branches)
    references.set(branch.hash, [...(references.get(branch.hash) || []), branch]);
  for (const commit of commits.values())
    for (const parent of commit.parents) {
      if (commits.has(parent)) children.set(parent, [...(children.get(parent) || []), commit.hash]);
    }
  const trunk = new Set<string>();
  let cursor = treeRefHash(data, data.baseRef);
  while (cursor && commits.has(cursor) && !trunk.has(cursor)) {
    trunk.add(cursor);
    cursor = commits.get(cursor)!.parents[0];
  }
  const lanes = new Map([...trunk].map((hash) => [hash, 0]));
  let laneCount = 0;
  const nextLane = () => (++laneCount % 2 ? -1 : 1) * Math.ceil(laneCount / 2);
  function assignChain(hash: string, lane: number) {
    while (commits.has(hash) && !lanes.has(hash)) {
      lanes.set(hash, lane);
      hash = commits.get(hash)!.parents[0];
    }
  }
  const orderedBranches = [...data.branches].sort(
    (a, b) => Number(b.current) - Number(a.current) || a.ref.localeCompare(b.ref, 'en'),
  );
  for (const branch of orderedBranches)
    if (!lanes.has(branch.hash)) assignChain(branch.hash, nextLane());
  if (data.head && !lanes.has(data.head)) assignChain(data.head, nextLane());
  for (const commit of commits.values())
    if (!lanes.has(commit.hash)) assignChain(commit.hash, nextLane());

  const visible = new Set(
    [...commits.values()]
      .filter(
        (commit) =>
          options.expanded ||
          commits.size <= 36 ||
          references.has(commit.hash) ||
          commit.hash === data.head ||
          commit.parents.length !== 1 ||
          (children.get(commit.hash)?.length || 0) !== 1 ||
          commit.parents.some((parent) => !commits.has(parent)),
      )
      .map((commit) => commit.hash),
  );
  const unfinished: Omit<TreeEdge, 'path'>[] = [];
  // Retain an anchor for merged lanes whose branch ref has been deleted.
  const visibleLanes = new Set([...visible].map((hash) => lanes.get(hash)));
  for (const [hash, lane] of lanes) {
    if (!visibleLanes.has(lane)) {
      visible.add(hash);
      visibleLanes.add(lane);
    }
  }
  const boundaries: TreeBoundary[] = [];
  for (const hash of visible) {
    const commit = commits.get(hash)!;
    commit.parents.forEach((original, index) => {
      let parent = original;
      const via: string[] = [];
      while (commits.has(parent) && !visible.has(parent)) {
        via.push(parent);
        parent = commits.get(parent)!.parents[0];
      }
      if (!commits.has(parent)) boundaries.push({ child: hash, parent, x: 0, y: 0 });
      else
        unfinished.push({
          parent,
          child: hash,
          via,
          merge: commit.parents.length > 1 && index > 0,
          trunk: trunk.has(hash) && trunk.has(parent) && index === 0,
        });
    });
  }
  const parentEdges = new Map<string, typeof unfinished>();
  for (const edge of unfinished)
    parentEdges.set(edge.child, [...(parentEdges.get(edge.child) || []), edge]);
  const progress = new Map<string, number>();
  function depth(hash: string): number {
    if (progress.has(hash)) return progress.get(hash)!;
    const value = Math.max(
      0,
      ...(parentEdges.get(hash) || []).map(
        (edge) =>
          depth(edge.parent) + Math.max(76, (references.get(edge.parent)?.length || 0) * 44 + 32),
      ),
    );
    progress.set(hash, value);
    return value;
  }
  for (const hash of visible) depth(hash);
  const maximum = Math.max(0, ...progress.values());
  const labelSpace = Math.max(
    88,
    ...[...references.values()].map((branches) => branches.length * 44 + 32),
  );
  const width = Math.max(
    320,
    Math.max(0, ...[...lanes.values()].map((lane) => Math.abs(lane))) * 232 + 128,
  );
  const height = Math.max(180, maximum + labelSpace + 60);
  const nodes = [...visible].map((hash) => ({
    commit: commits.get(hash)!,
    branches: references.get(hash) || [],
    lane: lanes.get(hash) || 0,
    x: width / 2 + (lanes.get(hash) || 0) * 116,
    y: labelSpace + maximum - progress.get(hash)!,
    onTrunk: trunk.has(hash),
    boundary: boundaries.some((boundary) => boundary.child === hash),
  }));
  const byHash = new Map(nodes.map((node) => [node.commit.hash, node]));
  const edges = unfinished.map((edge) => {
    const child = byHash.get(edge.child)!;
    const parent = byHash.get(edge.parent)!;
    const middle = (child.y + parent.y) / 2;
    return {
      ...edge,
      path: `M ${child.x} ${child.y} C ${child.x} ${middle}, ${parent.x} ${middle}, ${parent.x} ${parent.y}`,
    };
  });
  for (const boundary of boundaries) {
    boundary.x = byHash.get(boundary.child)!.x;
    boundary.y = byHash.get(boundary.child)!.y + 28;
  }
  return {
    nodes,
    edges,
    boundaries,
    width,
    height,
    roots: nodes.filter((node) => !node.commit.parents.length).map((node) => node.commit.hash),
    collapsed: [...unfinished].reduce((total, edge) => total + edge.via.length, 0),
  };
}
