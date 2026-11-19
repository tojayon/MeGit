import { moveRouteSegment, type RoutePoint } from './edge-route';
import type { SnapGuide, SnapLocks } from './snapping';

export function snapRouteMove(
  points: RoutePoint[],
  kind: 'point' | 'segment',
  index: number,
  delta: RoutePoint,
  zoom: number,
  previous: SnapLocks = {},
  enabled = true,
): { points: RoutePoint[]; guides: SnapGuide[]; locks: SnapLocks } {
  const moved =
    kind === 'segment'
      ? moveRouteSegment(points, index, delta)
      : points.map((p, i) => (i === index ? { x: p.x + delta.x, y: p.y + delta.y } : p));
  const guides: SnapGuide[] = [];
  const locks: SnapLocks = {};
  if (!enabled) return { points: moved, guides, locks };
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const a = points[index],
    b = points[index + 1];
  if (!a || (kind === 'segment' && !b)) return { points: moved, guides, locks };
  // A segment only moves along its normal; snapping must not rotate or stretch it.
  const axes: ('x' | 'y')[] =
    kind === 'point' ? ['x', 'y'] : a.x === b.x ? ['x'] : a.y === b.y ? ['y'] : [];
  const movingIndices =
    kind === 'point' ? [index] : [index + (index === 0 ? 1 : 0), index + (index === 0 ? 2 : 1)];
  const targets = points.flatMap((p, i) => {
    const fixed =
      kind === 'point'
        ? Math.abs(i - index) === 1
        : (i !== index && i !== index + 1) || i === 0 || i === points.length - 1;
    return fixed ? [{ point: p, index: i }] : [];
  });
  for (const axis of axes) {
    const position = moved[movingIndices[0]][axis];
    const choices = targets.map((target) => ({ ...target, id: `${axis}:${target.index}` }));
    const match =
      choices.find(
        (c) => c.id === previous[axis] && Math.abs(c.point[axis] - position) * scale <= 10,
      ) ||
      choices
        .filter((c) => Math.abs(c.point[axis] - position) * scale <= 6)
        .sort(
          (a, b) =>
            Math.abs(a.point[axis] - position) - Math.abs(b.point[axis] - position) ||
            a.index - b.index,
        )[0];
    if (!match) continue;
    locks[axis] = match.id;
    for (const i of movingIndices) moved[i] = { ...moved[i], [axis]: match.point[axis] };
    const cross = axis === 'x' ? 'y' : 'x';
    const values = [match.point[cross], ...movingIndices.map((i) => moved[i][cross])];
    const low = Math.min(...values) - 8 / scale,
      high = Math.max(...values) + 8 / scale;
    const at = match.point[axis];
    guides.push(
      axis === 'x'
        ? { x1: at, y1: low, x2: at, y2: high, kind: 'align' }
        : { x1: low, y1: at, x2: high, y2: at, kind: 'align' },
    );
  }
  return { points: moved, guides, locks };
}
