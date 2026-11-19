import type { Board, FlowConnection, FlowEdge } from '../../shared/types';
export type RoutePoint = { x: number; y: number };

export function compactRoute(points: RoutePoint[]) {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (result.length && point.x === result.at(-1)!.x && point.y === result.at(-1)!.y) continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (
        Math.abs((b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x)) > 0.001 ||
        (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0
      )
        break;
      result.pop();
    }
    result.push({ ...point });
  }
  return result;
}

// React Flow emits absolute M/L/Q commands for step paths. Quadratic controls are the original corners.
export function routePoints(path: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const match of path.matchAll(/([MLQC])([^MLQC]*)/gi)) {
    const values = match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
    if (match[1].toUpperCase() === 'Q') {
      points.push({ x: values[0], y: values[1] }, { x: values[2], y: values[3] });
    } else if (match[1].toUpperCase() === 'C') {
      const a = points.at(-1)!;
      for (const t of [1 / 3, 2 / 3, 1]) {
        const u = 1 - t;
        points.push({
          x:
            u ** 3 * a.x +
            3 * u ** 2 * t * values[0] +
            3 * u * t ** 2 * values[2] +
            t ** 3 * values[4],
          y:
            u ** 3 * a.y +
            3 * u ** 2 * t * values[1] +
            3 * u * t ** 2 * values[3] +
            t ** 3 * values[5],
        });
      }
    } else points.push({ x: values[0], y: values[1] });
  }
  return compactRoute(points);
}

export function moveRouteSegment(points: RoutePoint[], index: number, delta: RoutePoint) {
  const a = points[index],
    b = points[index + 1];
  if (!a || !b) return points;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return points;
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const distance = delta.x * normal.x + delta.y * normal.y;
  const shift = (point: RoutePoint) => ({
    x: point.x + normal.x * distance,
    y: point.y + normal.y * distance,
  });
  return [
    ...points.slice(0, index),
    ...(index === 0 ? [a] : []),
    shift(a),
    shift(b),
    ...(index + 1 === points.length - 1 ? [b] : []),
    ...points.slice(index + 2),
  ];
}

export function roundedRoute(points: RoutePoint[], radius = 12) {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y),
      after = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, before / 2, after / 2);
    if (!r) {
      path += ` L ${b.x} ${b.y}`;
      continue;
    }
    path += ` L ${b.x + ((a.x - b.x) * r) / before} ${b.y + ((a.y - b.y) * r) / before}`;
    path += ` Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) * r) / after} ${b.y + ((c.y - b.y) * r) / after}`;
  }
  const end = points.at(-1)!;
  return path + ` L ${end.x} ${end.y}`;
}

export function editedRoute(
  board: Board,
  id: string,
  waypoints: RoutePoint[] | undefined,
): FlowEdge | FlowConnection | null {
  const edge = board.edges.find((e) => e.id === id) || board.connections?.find((e) => e.id === id);
  if (
    !edge ||
    board.layoutLocked ||
    (waypoints &&
      (waypoints.length > 20 ||
        waypoints.some(
          (p) =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.abs(p.x) > 100000 ||
            Math.abs(p.y) > 100000,
        )))
  )
    return null;
  const result = { ...edge };
  if (waypoints?.length) result.waypoints = waypoints.map((p) => ({ ...p }));
  else delete result.waypoints;
  return result;
}
