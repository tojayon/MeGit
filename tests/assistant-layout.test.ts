import { expect, it } from 'vitest';
import { assistantEdges, boundAssistant, resizeAssistant } from '../src/lib/assistant-layout';
const bounds = { width: 1280, height: 720 };
const frame = { x: 400, y: 160, width: 424, height: 400 };
it('窗口可贴齐四边及覆盖整个视口，没有保护间距', () => {
  expect(boundAssistant({ x: -20, y: -20, width: 2000, height: 2000 }, bounds)).toEqual({
    x: 0,
    y: 0,
    ...bounds,
  });
  expect(boundAssistant({ ...frame, x: 2000, y: 2000 }, bounds)).toEqual({
    ...frame,
    x: 856,
    y: 320,
  });
  expect(boundAssistant(frame, { width: 280, height: 300 })).toEqual({
    x: 0,
    y: 0,
    width: 280,
    height: 300,
  });
});
it.each(assistantEdges)('从%s缩放时固定相对边，保持最小尺寸及视口边界', (edge) => {
  const next = resizeAssistant(frame, edge, -60, -50, bounds);
  if (edge.includes('w')) expect(next.x + next.width).toBe(frame.x + frame.width);
  if (edge.includes('n')) expect(next.y + next.height).toBe(frame.y + frame.height);
  if (edge.includes('e')) expect(next.x).toBe(frame.x);
  if (edge.includes('s')) expect(next.y).toBe(frame.y);
  const limited = resizeAssistant(frame, edge, 5000, 5000, bounds);
  expect(limited.width).toBeGreaterThanOrEqual(320);
  expect(limited.height).toBeGreaterThanOrEqual(360);
  expect(limited.x + limited.width).toBeLessThanOrEqual(bounds.width);
  expect(limited.y + limited.height).toBeLessThanOrEqual(bounds.height);
});
