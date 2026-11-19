import type {
  Board,
  FlowConnection,
  FlowEdge,
  FlowGroup,
  FlowNode,
  FlowNote,
  PortSide,
} from '../../shared/types';

// Validate real endpoints again at commit time; projected group handles are view-only.
export function reconnectedFlowConnection(
  board: Board,
  id: string,
  next: {
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  },
): FlowConnection | null {
  const previous = board.connections?.find((connection) => connection.id === id);
  const endpoints = [...board.nodes, ...(board.notes || [])];
  const port = (handle: string | null, type: 'source' | 'target') => {
    const side = handle?.slice(type.length + 1);
    return handle?.startsWith(`${type}-`) && ['top', 'right', 'bottom', 'left'].includes(side || '')
      ? (side as PortSide)
      : null;
  };
  const sourcePort = port(next.sourceHandle, 'source');
  const targetPort = port(next.targetHandle, 'target');
  if (
    !previous ||
    board.layoutLocked ||
    !sourcePort ||
    !targetPort ||
    next.source === next.target ||
    !endpoints.some((node) => node.id === next.source) ||
    !endpoints.some((node) => node.id === next.target) ||
    board.connections?.some(
      (connection) =>
        connection.id !== id &&
        connection.source === next.source &&
        connection.target === next.target &&
        connection.label === previous.label,
    ) ||
    (previous.source === next.source &&
      previous.target === next.target &&
      (previous.sourcePort || 'bottom') === sourcePort &&
      (previous.targetPort || 'top') === targetPort)
  )
    return null;
  return {
    id: previous.id,
    source: next.source,
    target: next.target,
    label: previous.label,
    sourcePort,
    targetPort,
  };
}

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export const REPOSITORY_SIZE: Size = { width: 276, height: 148 };
export const NOTE_SIZE: Size = { width: 276, height: 180 };
export function noteSize(note: Pick<FlowNote, 'kind'>): Size {
  if (!note.kind || note.kind === 'note') return NOTE_SIZE;
  return {
    width: 260,
    height: note.kind === 'decision' ? 138 : note.kind === 'process' ? 106 : 64,
  };
}

export function groupBounds(
  group: FlowGroup,
  nodes: FlowNode[],
  dimensions: Record<string, Size> = {},
) {
  const members = nodes.filter((n) => group.nodeIds.includes(n.id));
  const x = Math.min(...members.map((n) => n.position.x)) - 24;
  const y = Math.min(...members.map((n) => n.position.y)) - 56;
  return {
    x,
    y,
    width: Math.max(
      324,
      ...members.map(
        (n) => n.position.x + (dimensions[n.id]?.width ?? REPOSITORY_SIZE.width) + 24 - x,
      ),
    ),
    height: Math.max(
      180,
      ...members.map(
        (n) => n.position.y + (dimensions[n.id]?.height ?? REPOSITORY_SIZE.height) + 24 - y,
      ),
    ),
  };
}

// Apply one common delta so a group keeps its shape even at the coordinate boundary.
export function moveNodes(
  nodes: Pick<FlowNode, 'id' | 'position'>[],
  ids: string[],
  delta: Point,
): Record<string, Point> {
  const members = nodes.filter((n) => ids.includes(n.id));
  if (!members.length) return {};
  const clamp = (axis: 'x' | 'y') =>
    Math.max(
      -100_000 - Math.min(...members.map((n) => n.position[axis])),
      Math.min(delta[axis], 100_000 - Math.max(...members.map((n) => n.position[axis]))),
    );
  const x = clamp('x');
  const y = clamp('y');
  return Object.fromEntries(
    members.map((n) => [n.id, { x: n.position.x + x, y: n.position.y + y }]),
  );
}

export function selectedNodeIds(board: Board, ids: string[]) {
  return [
    ...new Set(ids.flatMap((id) => board.groups?.find((g) => g.id === id)?.nodeIds || [id])),
  ].filter((id) => [...board.nodes, ...(board.notes || [])].some((n) => n.id === id));
}

export function moveSelection(board: Board, ids: string[], delta: Point) {
  return board.layoutLocked
    ? {}
    : moveNodes([...board.nodes, ...(board.notes || [])], selectedNodeIds(board, ids), delta);
}

export type Arrangement =
  'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical';
export function selectionUnits(board: Board, ids: string[], dimensions: Record<string, Size> = {}) {
  const groups = (board.groups || []).filter((g) => ids.includes(g.id));
  const members = new Set(groups.flatMap((g) => g.nodeIds));
  return [
    ...groups.map((g) => ({
      ids: g.nodeIds,
      ...groupBounds(g, board.nodes, dimensions),
      ...(g.collapsed ? { width: 300, height: 100 } : {}),
    })),
    ...[...board.nodes, ...(board.notes || [])]
      .filter((n) => ids.includes(n.id) && !members.has(n.id))
      .map((n) => ({
        ids: [n.id],
        ...n.position,
        ...(dimensions[n.id] || ('repoId' in n ? REPOSITORY_SIZE : noteSize(n))),
      })),
  ];
}

export function arrangeSelection(
  board: Board,
  ids: string[],
  kind: Arrangement,
  dimensions: Record<string, Size> = {},
) {
  const units = selectionUnits(board, ids, dimensions);
  if (board.layoutLocked || units.length < 2) return {};
  const horizontal = ['left', 'center', 'right', 'horizontal'].includes(kind);
  const axis = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  const min = Math.min(...units.map((u) => u[axis]));
  const max = Math.max(...units.map((u) => u[axis] + u[size]));
  const distribution = kind === 'horizontal' || kind === 'vertical';
  if (distribution && units.length < 3) return {};
  const sorted = [...units].sort((a, b) => a[axis] - b[axis]);
  const gap = (max - min - units.reduce((sum, u) => sum + u[size], 0)) / (units.length - 1);
  let cursor = min;
  const result: Record<string, Point> = {};
  for (const unit of sorted) {
    const target = distribution
      ? cursor
      : ['left', 'top'].includes(kind)
        ? min
        : ['right', 'bottom'].includes(kind)
          ? max - unit[size]
          : (min + max - unit[size]) / 2;
    Object.assign(
      result,
      moveNodes([...board.nodes, ...(board.notes || [])], unit.ids, {
        x: horizontal ? target - unit.x : 0,
        y: horizontal ? 0 : target - unit.y,
      }),
    );
    cursor += unit[size] + gap;
  }
  return result;
}

export function visibleRelations(board: Board) {
  const collapsed = new Map(
    (board.groups || [])
      .filter((g) => g.collapsed)
      .flatMap((g) => g.nodeIds.map((id) => [id, g.id] as const)),
  );
  return board.edges.flatMap((relation) => {
    const source = collapsed.get(relation.source) || relation.source;
    const target = collapsed.get(relation.target) || relation.target;
    return source === target ? [] : [{ relation, source, target }];
  });
}

export function saveGroup(board: Board, group: FlowGroup) {
  const members = new Set(group.nodeIds);
  const others = (board.groups || [])
    .filter((g) => g.id !== group.id)
    .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !members.has(id)) }))
    .filter((g) => g.nodeIds.length);
  board.groups = [...others, group];
}

export function removeNode(board: Board, id: string) {
  board.nodes = board.nodes.filter((n) => n.id !== id);
  if (board.notes) board.notes = board.notes.filter((n) => n.id !== id);
  if (board.connections)
    board.connections = board.connections.filter((e) => e.source !== id && e.target !== id);
  board.edges = board.edges.filter((e) => e.source !== id && e.target !== id);
  if (board.groups)
    board.groups = board.groups
      .map((g) => ({
        ...g,
        nodeIds: g.nodeIds.filter((member) => member !== id),
      }))
      .filter((g) => g.nodeIds.length);
}

export function flowContext(edges: Pick<FlowEdge, 'id' | 'source' | 'target'>[], seeds: string[]) {
  const nodeIds = new Set(seeds);
  const edgeIds = new Set<string>();
  for (const direction of ['source', 'target'] as const) {
    const visited = new Set(seeds);
    const queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      for (const edge of edges) {
        if (edge[direction] !== queue[i]) continue;
        edgeIds.add(edge.id);
        const other = edge[direction === 'source' ? 'target' : 'source'];
        nodeIds.add(other);
        if (!visited.has(other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
  }
  return { nodeIds, edgeIds };
}
