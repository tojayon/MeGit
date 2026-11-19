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
  label: { x: number; y: number };
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

function junctionHeight(from: number, to: number, gap: number) {
  return from === to
    ? 0
    : Math.min(gap / 2, Math.max(48, Math.min(88, Math.abs(to - from) * 0.75)));
}

function smoothJunction(x: number, y: number, endX: number, endY: number) {
  const handle = (endY - y) / 3;
  // One shared inflection anchor keeps the tangent and curvature continuous.
  // Paired control points on each vertical track ease into and out of the turn.
  return ` C ${x} ${y + handle}, ${x} ${y + handle}, ${(x + endX) / 2} ${(y + endY) / 2} C ${endX} ${endY - handle}, ${endX} ${endY - handle}, ${endX} ${endY}`;
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
  const unfinished: Omit<TreeEdge, 'path' | 'label'>[] = [];
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
  // Reserve 48 screen pixels at the minimum 50% scale: a 44px commit target
  // plus separation. Branch labels also need their own row above that target.
  const commitRowGap = 96;
  function depth(hash: string): number {
    if (progress.has(hash)) return progress.get(hash)!;
    const value = Math.max(
      0,
      ...(parentEdges.get(hash) || []).map(
        (edge) =>
          depth(edge.parent) + (references.get(edge.parent)?.length || 0) * 44 + commitRowGap,
      ),
    );
    progress.set(hash, value);
    return value;
  }
  for (const hash of visible) depth(hash);
  const maximum = Math.max(0, ...progress.values());
  const labelSpace = Math.max(
    commitRowGap,
    ...[...references.values()].map((branches) => branches.length * 44 + commitRowGap),
  );
  let width = Math.max(
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
  // Keep long connections on a straight track. Only the short junctions bend,
  // so a merge never follows the trunk for most of its length.
  const tracks = new Map<(typeof unfinished)[number], number>();
  const occupied: { x: number; top: number; bottom: number }[] = [];
  const crossesLanes = (edge: (typeof unfinished)[number]) =>
    byHash.get(edge.child)!.x !== byHash.get(edge.parent)!.x;
  const routingOrder = [...unfinished].sort(
    (a, b) =>
      Number(a.merge) - Number(b.merge) || Number(crossesLanes(a)) - Number(crossesLanes(b)),
  );
  for (const edge of routingOrder) {
    const child = byHash.get(edge.child)!;
    const parent = byHash.get(edge.parent)!;
    const preferred = edge.merge ? parent.x : child.x;
    let track = preferred;
    if (child.x !== parent.x || edge.merge) {
      const blocked = (x: number) =>
        nodes.some((node) => node.y > child.y && node.y < parent.y && Math.abs(node.x - x) < 16) ||
        occupied.some(
          (segment) =>
            Math.abs(segment.x - x) < 16 &&
            Math.min(parent.y, segment.bottom) > Math.max(child.y, segment.top),
        );
      // A branch may continue after being merged. Give its merge connection a
      // separate nearby track rather than drawing through unrelated commits.
      const outward = preferred < width / 2 ? -1 : 1;
      for (let offset = 0; blocked(track); offset++) {
        const distance = (Math.floor(offset / 2) + 1) * 24;
        track = preferred + distance * (offset % 2 ? -outward : outward);
      }
    }
    tracks.set(edge, track);
    const gap = parent.y - child.y;
    occupied.push({
      x: track,
      top: child.y + junctionHeight(child.x, track, gap),
      bottom: parent.y - junctionHeight(track, parent.x, gap),
    });
  }
  const extent = Math.max(
    width / 2 - 64,
    ...[...tracks.values()].map((x) => Math.abs(x - width / 2)),
  );
  const padding = Math.max(0, extent + 64 - width / 2);
  width += padding * 2;
  for (const node of nodes) node.x += padding;
  const edges = unfinished.map((edge) => {
    const child = byHash.get(edge.child)!;
    const parent = byHash.get(edge.parent)!;
    const track = tracks.get(edge)! + padding;
    const gap = parent.y - child.y;
    const top = child.y + junctionHeight(child.x, track, gap);
    const bottom = parent.y - junctionHeight(track, parent.x, gap);
    let path = `M ${child.x} ${child.y}`;
    if (track !== child.x) path += smoothJunction(child.x, child.y, track, top);
    path += ` V ${bottom}`;
    if (track !== parent.x) path += smoothJunction(track, bottom, parent.x, parent.y);
    return {
      ...edge,
      path,
      label: { x: track, y: (child.y + parent.y) / 2 },
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
