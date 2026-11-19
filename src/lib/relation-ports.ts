import type { FlowEdge } from '../../shared/types';
import type { Point, Size } from './whiteboard';

/** Resolve only the display projection; saved ports and edited routes retain their meaning. */
export function relationPorts(
  edge: Pick<FlowEdge, 'sourcePort' | 'targetPort' | 'waypoints'>,
  source: Point & Size,
  target: Point & Size,
) {
  const dx = target.x + target.width / 2 - source.x - source.width / 2;
  const dy = target.y + target.height / 2 - source.y - source.height / 2;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourcePort = edge.waypoints?.length
    ? 'right'
    : horizontal
      ? dx >= 0
        ? 'right'
        : 'left'
      : dy >= 0
        ? 'bottom'
        : 'top';
  const targetPort = edge.waypoints?.length
    ? 'left'
    : horizontal
      ? dx >= 0
        ? 'left'
        : 'right'
      : dy >= 0
        ? 'top'
        : 'bottom';
  return { sourcePort: edge.sourcePort || sourcePort, targetPort: edge.targetPort || targetPort };
}
