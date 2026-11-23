import type { Board } from '../../shared/types';
import {
  groupBounds,
  selectedNodeIds,
  selectionUnits,
  noteSize,
  REPOSITORY_SIZE,
  type Point,
  type Size,
} from './whiteboard';

type Axis = 'x' | 'y';
type Rect = Point & Size;
type Target = Rect & { id: string; spacing: boolean };
export type SnapLocks = Partial<Record<Axis, string>>;
export type SnapGuide = { x1: number; y1: number; x2: number; y2: number; kind: 'align' | 'gap' };
export type SnapScene = {
  moving: Rect;
  targets: Target[];
  min: Point;
  max: Point;
};

export function createSnapScene(
  board: Board,
  ids: string[],
  dimensions: Record<string, Size> = {},
  visibleIds?: string[],
): SnapScene | null {
  if (board.layoutLocked) return null;
  const movingIds = new Set(selectedNodeIds(board, ids));
  const units = selectionUnits(board, ids, dimensions);
  if (!movingIds.size || !units.length) return null;
  const x = Math.min(...units.map((unit) => unit.x));
  const y = Math.min(...units.map((unit) => unit.y));
  const moving = {
    x,
    y,
    width: Math.max(...units.map((unit) => unit.x + unit.width)) - x,
    height: Math.max(...units.map((unit) => unit.y + unit.height)) - y,
  };
  const groups = board.groups || [];
  const visible = visibleIds && new Set(visibleIds);
  const fixedGroups = groups.filter(
    (group) =>
      (!visible || visible.has(group.id)) && !group.nodeIds.some((id) => movingIds.has(id)),
  );
  const hidden = new Set(
    groups
      .filter((group) => group.collapsed && (!visible || visible.has(group.id)))
      .flatMap((group) => group.nodeIds),
  );
  const targets: Target[] = [
    ...fixedGroups.map((group) => ({
      id: group.id,
      spacing: true,
      ...groupBounds(group, board.nodes, dimensions),
      ...(group.collapsed ? { width: 300, height: 100 } : {}),
    })),
    ...[...board.nodes, ...(board.notes || [])]
      .filter(
        (node) =>
          !movingIds.has(node.id) && !hidden.has(node.id) && (!visible || visible.has(node.id)),
      )
      .map((node) => ({
        id: node.id,
        spacing: !fixedGroups.some((group) => group.nodeIds.includes(node.id)),
        ...node.position,
        ...(dimensions[node.id] || ('repoId' in node ? REPOSITORY_SIZE : noteSize(node))),
      })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const members = [...board.nodes, ...(board.notes || [])].filter((node) => movingIds.has(node.id));
  return {
    moving,
    targets,
    min: {
      x: -100000 - Math.min(...members.map((node) => node.position.x)),
      y: -100000 - Math.min(...members.map((node) => node.position.y)),
    },
    max: {
      x: 100000 - Math.max(...members.map((node) => node.position.x)),
      y: 100000 - Math.max(...members.map((node) => node.position.y)),
    },
  };
}

type Match = {
  id: string;
  at: number;
  target: Target;
  anchor?: number;
  pair?: { other: Target; order: 'before' | 'between' | 'after' };
};
const sizeOf = (axis: Axis) => (axis === 'x' ? 'width' : 'height');
const crossOf = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const end = (rect: Rect, axis: Axis) => rect[axis] + rect[sizeOf(axis)];
const rangeGap = (first: Rect, second: Rect, axis: Axis) =>
  Math.max(0, first[axis] - end(second, axis), second[axis] - end(first, axis));

function candidates(scene: SnapScene, moving: Rect, axis: Axis, zoom: number): Match[] {
  const size = sizeOf(axis);
  const cross = crossOf(axis);
  const result: Match[] = [];
  for (const target of scene.targets) {
    if (rangeGap(moving, target, cross) * zoom > 320) continue;
    for (const [sourceAnchor, targetAnchor] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [0, 1],
      [1, 0],
    ]) {
      result.push({
        id: `${axis}:align:${target.id}:${sourceAnchor}:${targetAnchor}`,
        at: target[axis] + target[size] * targetAnchor - moving[size] * sourceAnchor,
        target,
        anchor: sourceAnchor,
      });
    }
  }
  const lane = scene.targets
    .filter(
      (target) =>
        target.spacing &&
        Math.min(end(moving, cross), end(target, cross)) - Math.max(moving[cross], target[cross]) >=
          Math.min(moving[sizeOf(cross)], target[sizeOf(cross)]) / 2,
    )
    .sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id));
  for (let index = 1; index < lane.length; index++) {
    const first = lane[index - 1];
    const second = lane[index];
    const gap = second[axis] - end(first, axis);
    if (gap <= 0) continue;
    const add = (order: 'before' | 'between' | 'after', at: number) =>
      result.push({
        id: `${axis}:gap:${first.id}:${second.id}:${order}`,
        at,
        target: first,
        pair: { other: second, order },
      });
    if (gap >= moving[size]) add('between', (end(first, axis) + second[axis] - moving[size]) / 2);
    add('before', first[axis] - gap - moving[size]);
    add('after', end(second, axis) + gap);
  }
  return result;
}

function guides(match: Match, moving: Rect, axis: Axis, zoom: number): SnapGuide[] {
  const cross = crossOf(axis);
  const line = (along: number, from: number, to: number, kind: SnapGuide['kind']): SnapGuide =>
    axis === 'x'
      ? {
          x1: kind === 'align' ? along : from,
          x2: kind === 'align' ? along : to,
          y1: kind === 'align' ? from : along,
          y2: kind === 'align' ? to : along,
          kind,
        }
      : {
          y1: kind === 'align' ? along : from,
          y2: kind === 'align' ? along : to,
          x1: kind === 'align' ? from : along,
          x2: kind === 'align' ? to : along,
          kind,
        };
  if (!match.pair)
    return [
      line(
        moving[axis] + moving[sizeOf(axis)] * match.anchor!,
        Math.min(moving[cross], match.target[cross]) - 8 / zoom,
        Math.max(end(moving, cross), end(match.target, cross)) + 8 / zoom,
        'align',
      ),
    ];
  const { other, order } = match.pair;
  const sorted =
    order === 'before'
      ? [moving, match.target, other]
      : order === 'after'
        ? [match.target, other, moving]
        : [match.target, moving, other];
  const along = Math.max(...sorted.map((rect) => end(rect, cross))) + 12 / zoom;
  return [
    line(along, end(sorted[0], axis), sorted[1][axis], 'gap'),
    line(along, end(sorted[1], axis), sorted[2][axis], 'gap'),
  ];
}

export function snapMove(
  scene: SnapScene,
  delta: Point,
  zoom: number,
  previous: SnapLocks = {},
  movementAxis: Axis | null = null,
) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const moving = { ...scene.moving, x: scene.moving.x + delta.x, y: scene.moving.y + delta.y };
  const locks: SnapLocks = {};
  const matches: Partial<Record<Axis, Match>> = {};
  const corrected = { ...delta };
  for (const axis of ['x', 'y'] as const) {
    if (movementAxis && axis !== movementAxis) continue;
    const choices = candidates(scene, moving, axis, scale);
    const held = choices.find(
      (choice) => choice.id === previous[axis] && Math.abs(choice.at - moving[axis]) * scale <= 10,
    );
    const match =
      held ||
      choices
        .filter((choice) => Math.abs(choice.at - moving[axis]) * scale <= 6)
        .sort(
          (a, b) =>
            Math.abs(a.at - moving[axis]) - Math.abs(b.at - moving[axis]) ||
            Number(!!a.pair) - Number(!!b.pair) ||
            a.id.localeCompare(b.id),
        )[0];
    const requested = match ? match.at - scene.moving[axis] : delta[axis];
    corrected[axis] = Math.max(scene.min[axis], Math.min(scene.max[axis], requested));
    if (match && Math.abs(corrected[axis] - requested) < 0.000001) {
      matches[axis] = match;
      locks[axis] = match.id;
    }
  }
  const result = {
    ...scene.moving,
    x: scene.moving.x + corrected.x,
    y: scene.moving.y + corrected.y,
  };
  return {
    delta: corrected,
    locks,
    guides: (['x', 'y'] as const).flatMap((axis) =>
      matches[axis] ? guides(matches[axis], result, axis, scale) : [],
    ),
  };
}
