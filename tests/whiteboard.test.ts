import { describe, expect, it } from 'vitest';
import type { Board, FlowEdge, FlowGroup } from '../shared/types';
import * as whiteboard from '../src/lib/whiteboard';

const edge = (id: string, source: string, target: string): FlowEdge => ({
  id,
  source,
  target,
  kind: 'dependency',
  label: '',
  sourceRef: 'HEAD',
  targetRef: 'HEAD',
});
const group: FlowGroup = { id: 'g', name: 'Group', nodeIds: ['a', 'b'], collapsed: false };
const makeBoard = (): Board => ({
  id: 'board',
  name: 'Board',
  description: '',
  groups: [structuredClone(group)],
  nodes: [
    { id: 'a', repoId: 'ra', position: { x: 100, y: 100 } },
    { id: 'b', repoId: 'rb', position: { x: 400, y: 250 } },
    { id: 'c', repoId: 'rc', position: { x: 850, y: 200 } },
  ],
  edges: [edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bc', 'b', 'c')],
});

describe('流程连线端点重连', () => {
  const setup = () => {
    const board = makeBoard();
    board.connections = [
      {
        id: 'flow',
        source: 'a',
        target: 'b',
        label: '通过',
        sourcePort: 'bottom',
        targetPort: 'top',
        waypoints: [{ x: 20, y: 30 }],
      },
    ];
    return board;
  };
  it('保留身份和条件，更换目标与端口，清除旧折点且不修改原白板', () => {
    const board = setup();
    const before = structuredClone(board);
    expect(
      whiteboard.reconnectedFlowConnection(board, 'flow', {
        source: 'a',
        target: 'c',
        sourceHandle: 'source-bottom',
        targetHandle: 'target-left',
      }),
    ).toEqual({
      id: 'flow',
      source: 'a',
      target: 'c',
      label: '通过',
      sourcePort: 'bottom',
      targetPort: 'left',
    });
    expect(board).toEqual(before);
  });
  it('可以只更换来源端口，也可将来源改为流程步骤', () => {
    const board = setup();
    board.notes = [
      { id: 'step', title: '步骤', text: '', kind: 'process', position: { x: 0, y: 0 } },
    ];
    expect(
      whiteboard.reconnectedFlowConnection(board, 'flow', {
        source: 'a',
        target: 'b',
        sourceHandle: 'source-right',
        targetHandle: 'target-top',
      })?.sourcePort,
    ).toBe('right');
    expect(
      whiteboard.reconnectedFlowConnection(board, 'flow', {
        source: 'step',
        target: 'b',
        sourceHandle: 'source-right',
        targetHandle: 'target-top',
      })?.source,
    ).toBe('step');
  });
  it('拒绝自连接、悬空、投影端点、无效端口、重复、未变化和锁定操作', () => {
    const board = setup();
    const valid = {
      source: 'a',
      target: 'c',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-left',
    };
    for (const change of [
      { target: 'a' },
      { target: 'missing' },
      { target: 'g' },
      { targetHandle: 'target-left:projected' },
      { sourceHandle: 'target-top' },
      { sourceHandle: null },
      { target: 'b', targetHandle: 'target-top' },
    ])
      expect(
        whiteboard.reconnectedFlowConnection(board, 'flow', { ...valid, ...change }),
      ).toBeNull();
    board.connections!.push({ id: 'duplicate', source: 'a', target: 'c', label: '通过' });
    expect(whiteboard.reconnectedFlowConnection(board, 'flow', valid)).toBeNull();
    board.connections!.pop();
    board.layoutLocked = true;
    expect(whiteboard.reconnectedFlowConnection(board, 'flow', valid)).toBeNull();
  });
});

describe('白板分组投影', () => {
  it('边界包围成员，采用实际测量的节点尺寸', () => {
    expect(
      whiteboard.groupBounds(group, makeBoard().nodes, { b: { width: 300, height: 200 } }),
    ).toEqual({ x: 76, y: 44, width: 648, height: 430 });
  });

  it('整体移动只影响成员，保持相对位置，坐标上限时共同限幅', () => {
    const board = makeBoard();
    board.nodes[0].position.x = 99990;
    board.nodes[1].position.x = 99900;
    expect(whiteboard.moveNodes(board.nodes, group.nodeIds, { x: 50, y: -30 })).toEqual({
      a: { x: 100000, y: 70 },
      b: { x: 99910, y: 220 },
    });
    expect(board.nodes[0].position).toEqual({ x: 99990, y: 100 });
  });

  it('折叠不改真实端点，隐藏内部关系，跨组关系保留身份和各自端口', () => {
    const board = makeBoard();
    board.groups![0].collapsed = true;
    board.edges[1].sourcePort = 'bottom';
    const original = structuredClone(board);
    expect(whiteboard.visibleRelations(board)).toEqual([
      { relation: board.edges[1], source: 'g', target: 'c' },
      { relation: board.edges[2], source: 'g', target: 'c' },
    ]);
    expect(board).toEqual(original);
    board.groups![0].collapsed = false;
    expect(whiteboard.visibleRelations(board)).toHaveLength(3);
  });

  it('变更分组成员会移出旧组，移除节点后清理空组和悬空边', () => {
    const board = makeBoard();
    whiteboard.saveGroup(board, { id: 'g2', name: 'New', nodeIds: ['a', 'c'], collapsed: false });
    expect(board.groups).toEqual([
      { ...group, nodeIds: ['b'] },
      { id: 'g2', name: 'New', nodeIds: ['a', 'c'], collapsed: false },
    ]);
    whiteboard.removeNode(board, 'b');
    expect(board.groups).toHaveLength(1);
    expect(board.edges.map((e) => e.id)).toEqual(['ac']);
    expect(board.nodes.map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('上下游高亮', () => {
  it('流程步骤上下游可达，移除端点清理流程线，保持 Git 关系独立', () => {
    const board = makeBoard();
    board.notes = [
      { id: 'step', kind: 'process', title: '检查', text: '', position: { x: 0, y: 0 } },
    ];
    board.connections = [{ id: 'flow', source: 'a', target: 'step', label: '检查' }];
    expect(whiteboard.flowContext(board.connections, ['a']).nodeIds.has('step')).toBe(true);
    whiteboard.removeNode(board, 'step');
    expect(board.notes).toEqual([]);
    expect(board.connections).toEqual([]);
    expect(board.edges).toHaveLength(3);
  });
  it('追踪上下游所有可达边，跳过旁支并处理环', () => {
    const edges = [
      edge('ab', 'a', 'b'),
      edge('bc', 'b', 'c'),
      edge('ca', 'c', 'a'),
      edge('db', 'd', 'b'),
      edge('cd', 'c', 'e'),
      edge('dx', 'd', 'x'),
      edge('uv', 'u', 'v'),
    ];
    const result = whiteboard.flowContext(edges, ['b']);
    expect([...result.edgeIds].sort()).toEqual(['ab', 'bc', 'ca', 'cd', 'db']);
    expect([...result.nodeIds].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('多选与排列', () => {
  it('组和成员重复选择只移动一次，混合说明与仓库保持整体限幅', () => {
    const board = makeBoard();
    board.notes = [{ id: 'note', title: '说明', text: '', position: { x: 99990, y: 10 } }];
    expect(whiteboard.moveSelection(board, ['g', 'a', 'note'], { x: 50, y: 20 })).toEqual({
      a: { x: 110, y: 120 },
      b: { x: 410, y: 270 },
      note: { x: 100000, y: 30 },
    });
    board.layoutLocked = true;
    expect(whiteboard.moveSelection(board, ['g'], { x: 50, y: 20 })).toEqual({});
  });

  it('分组作为整体排列，保留成员间距；等间距按实际边界计算', () => {
    const board = makeBoard();
    const result = whiteboard.arrangeSelection(board, ['g', 'c'], 'top');
    expect(result.b.y - result.a.y).toBe(150);
    expect(result.c.y).toBe(44);
    board.groups = [];
    board.nodes[0].position = { x: 0, y: 0 };
    board.nodes[1].position = { x: 400, y: 30 };
    board.nodes[2].position = { x: 1000, y: 80 };
    const distributed = whiteboard.arrangeSelection(board, ['a', 'b', 'c'], 'horizontal');
    expect(distributed.b.x).toBe(500);
    expect(distributed.a.x).toBe(0);
    expect(distributed.c.x).toBe(1000);
    board.layoutLocked = true;
    expect(whiteboard.arrangeSelection(board, ['a', 'b'], 'left')).toEqual({});
  });
});
