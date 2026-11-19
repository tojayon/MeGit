import { describe, expect, it } from 'vitest';
import { snapRouteMove } from '../src/lib/edge-route-snapping';

describe('连线路线横平竖直吸附', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 30 },
    { x: 100, y: 80 },
  ];

  it('折点分别对齐相邻点的水平和垂直位置，端点保持不变', () => {
    const result = snapRouteMove(points, 'point', 1, { x: -36, y: 46 }, 1);
    expect(result.points).toEqual([points[0], { x: 0, y: 80 }, points[2]]);
    expect(result.guides).toHaveLength(2);
    expect(points[1]).toEqual({ x: 40, y: 30 });
  });

  it.each([0.5, 1, 2])('屏幕阈值不随缩放变化，锁定在10px内保持，超过释放：%s', (zoom) => {
    const move = (pixels: number, locks = {}) =>
      snapRouteMove(points, 'point', 1, { x: -40 + pixels / zoom, y: 10 }, zoom, locks);
    const first = move(5.9);
    expect(first.points[1].x).toBe(0);
    expect(move(9.9, first.locks).points[1].x).toBe(0);
    expect(move(10.1, first.locks).points[1].x).toBeCloseTo(10.1 / zoom);
    expect(move(6.1).locks).toEqual({});
  });

  it('相近候选不会抢走已锁定轴，跳过或关闭时返回原始拖动', () => {
    const close = [points[0], points[1], { x: 4, y: 80 }];
    const held = snapRouteMove(close, 'point', 1, { x: -40, y: 10 }, 1);
    expect(snapRouteMove(close, 'point', 1, { x: -36, y: 10 }, 1, held.locks).points[1].x).toBe(0);
    const free = snapRouteMove(close, 'point', 1, { x: -36, y: 10 }, 1, held.locks, false);
    expect(free.points[1]).toEqual({ x: 4, y: 40 });
    expect(free.guides).toEqual([]);
    expect(free.locks).toEqual({});
  });

  it('横竖线段沿法向吸附，首尾端点固定；斜线不被扭曲', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 80 },
      { x: 100, y: 80 },
    ];
    expect(snapRouteMove(route, 'segment', 1, { x: 56, y: 300 }, 1).points).toEqual([
      route[0],
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      route[3],
    ]);
    expect(snapRouteMove(route, 'segment', 0, { x: 30, y: 76 }, 1).points).toEqual([
      route[0],
      { x: 0, y: 80 },
      { x: 40, y: 80 },
      ...route.slice(2),
    ]);
    const diagonal = snapRouteMove(points, 'segment', 0, { x: 10, y: 20 }, 1);
    expect(diagonal.guides).toEqual([]);
    expect(diagonal.points[0]).toEqual(points[0]);
    expect(diagonal.points.at(-1)).toEqual(points.at(-1));
  });
});
