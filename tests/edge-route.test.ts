import { describe, expect, it } from 'vitest';
import { routePoints, moveRouteSegment, roundedRoute, editedRoute } from '../src/lib/edge-route';
import type { Board } from '../shared/types';
import { workspaceSchema } from '../server/workspace';

describe('连线路线编辑', () => {
  it('自动圆角路线提取原始转角，拖动线段只移动垂直方向且保留端点', () => {
    const points = routePoints('M0 0L 38,0Q 50,0 50,12L 50,88Q 50,100 62,100L100 100');
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]);
    expect(moveRouteSegment(points, 1, { x: 25, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 75, y: 0 },
      { x: 75, y: 100 },
      { x: 100, y: 100 },
    ]);
    expect(
      moveRouteSegment(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        0,
        { x: 20, y: 40 },
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 0 },
    ]);
    expect(roundedRoute(points, 12)).toContain('Q');
    expect(roundedRoute(points, 0)).not.toContain('Q');
    expect(routePoints('M0,0 C0,90 90,90 90,0')).toEqual(
      [
        { x: 0, y: 0 },
        { x: 70 / 3, y: 60 },
        { x: 200 / 3, y: 60 },
        { x: 90, y: 0 },
      ].map((p) => ({ x: expect.closeTo(p.x, 8), y: expect.closeTo(p.y, 8) })),
    );
  });

  it('两种线原子写回路线，不改端点引用；锁定与非法坐标拒绝，支持恢复自动路线', () => {
    const board: Board = {
      id: 'b',
      name: 'b',
      description: '',
      nodes: [],
      edges: [
        {
          id: 'git',
          source: 'a',
          target: 'b',
          kind: 'integration',
          label: '发布',
          sourceRef: 'HEAD',
          targetRef: 'HEAD',
        },
      ],
      connections: [{ id: 'flow', source: 'a', target: 'b', label: '检查' }],
    };
    const points = [
      { x: 20, y: -50 },
      { x: 80, y: -50 },
    ];
    expect(editedRoute(board, 'git', points)).toEqual({ ...board.edges[0], waypoints: points });
    expect(editedRoute(board, 'flow', points)).toEqual({
      ...board.connections![0],
      waypoints: points,
    });
    expect(editedRoute({ ...board, layoutLocked: true }, 'git', points)).toBeNull();
    expect(editedRoute(board, 'git', [{ x: Infinity, y: 0 }])).toBeNull();
    expect(editedRoute(board, 'git', Array(21).fill({ x: 0, y: 0 }))).toBeNull();
    expect(editedRoute(board, 'missing', points)).toBeNull();
    board.edges[0] = { ...board.edges[0], waypoints: points };
    expect(editedRoute(board, 'git', undefined)).not.toHaveProperty('waypoints');
  });

  it('Git 关系自定义路线由工作区协议保留并验证', () => {
    const workspace = {
      version: 1,
      revision: 0,
      activeBoardId: 'b',
      repositories: [],
      boards: [
        {
          id: 'b',
          name: 'b',
          description: '',
          nodes: [],
          edges: [
            {
              id: 'git',
              source: 'a',
              target: 'b',
              kind: 'dependency',
              label: '',
              sourceRef: 'HEAD',
              targetRef: 'HEAD',
              waypoints: [{ x: -20, y: 55 }],
            },
          ],
        },
      ],
    };
    expect(workspaceSchema.parse(workspace).boards[0].edges[0]).toHaveProperty('waypoints', [
      { x: -20, y: 55 },
    ]);
    workspace.boards[0].edges[0].waypoints[0].x = 100001;
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });
});
