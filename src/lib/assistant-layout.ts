export type AssistantFrame = { x: number; y: number; width: number; height: number };
export const assistantEdges = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export type AssistantEdge = (typeof assistantEdges)[number];
export type AssistantBounds = { width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
export function boundAssistant(frame: AssistantFrame, bounds: AssistantBounds): AssistantFrame {
  const width = clamp(frame.width, Math.min(320, bounds.width), bounds.width);
  const height = clamp(frame.height, Math.min(360, bounds.height), bounds.height);
  return {
    width,
    height,
    x: clamp(frame.x, 0, bounds.width - width),
    y: clamp(frame.y, 0, bounds.height - height),
  };
}
export function resizeAssistant(
  frame: AssistantFrame,
  edge: AssistantEdge,
  dx: number,
  dy: number,
  bounds: AssistantBounds,
): AssistantFrame {
  const base = boundAssistant(frame, bounds);
  let left = base.x,
    top = base.y,
    right = left + base.width,
    bottom = top + base.height;
  if (edge.includes('w')) left = clamp(left + dx, 0, right - Math.min(320, bounds.width));
  if (edge.includes('e'))
    right = clamp(right + dx, left + Math.min(320, bounds.width), bounds.width);
  if (edge.includes('n')) top = clamp(top + dy, 0, bottom - Math.min(360, bounds.height));
  if (edge.includes('s'))
    bottom = clamp(bottom + dy, top + Math.min(360, bounds.height), bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
