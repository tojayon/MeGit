type Point = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };

export function clampDialogOffset(
  offset: Point,
  base: Box,
  viewport: { width: number; height: number },
): Point {
  const minX = 8 - base.left;
  const minY = 8 - base.top;
  const maxX = viewport.width - 8 - base.left - base.width;
  const maxY = Math.max(minY, viewport.height - 8 - base.top - base.height);
  return {
    x: maxX < minX ? maxX : Math.max(minX, Math.min(maxX, offset.x)),
    y: Math.max(minY, Math.min(maxY, offset.y)),
  };
}
