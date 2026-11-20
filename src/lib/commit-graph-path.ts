type GraphPoint = { x: number; y: number };

export function junctionHeight(from: number, to: number, gap: number) {
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

export function commitGraphPath(child: GraphPoint, parent: GraphPoint, track: number) {
  const gap = parent.y - child.y;
  const top = child.y + junctionHeight(child.x, track, gap);
  const bottom = parent.y - junctionHeight(track, parent.x, gap);
  let path = `M ${child.x} ${child.y}`;
  if (track !== child.x) path += smoothJunction(child.x, child.y, track, top);
  path += ` V ${bottom}`;
  if (track !== parent.x) path += smoothJunction(track, bottom, parent.x, parent.y);
  return path;
}
