import { expect, it } from 'vitest';
import { applyBoardOperations, boardSignature } from '../shared/assistant-board';
import type { Board } from '../shared/types';
import { AssistantService } from '../server/assistant';
const board: Board = {
  id: 'b',
  name: 'Flow',
  description: '',
  nodes: [{ id: 'repo', repoId: 'one', position: { x: 0, y: 0 } }],
  edges: [],
  notes: [{ id: 'start', title: 'Start', text: '', kind: 'start', position: { x: 20, y: 30 } }],
  connections: [{ id: 'e', source: 'start', target: 'repo', label: 'go' }],
};
it('整批生成和编辑流程，不改变原白板或仓库登记；删除步骤同时清理关联流程线', () => {
  const changed = applyBoardOperations(board, [
    {
      type: 'addStep',
      id: 'test',
      title: 'Test',
      text: '',
      summary: '',
      kind: 'decision',
      position: { x: 0, y: 0 },
    },
    { type: 'updateConnection', id: 'e', target: 'test' },
    { type: 'connect', id: 'yes', source: 'test', target: 'repo', label: 'pass' },
    { type: 'arrange', direction: 'vertical' },
  ]);
  expect(board.notes).toHaveLength(1);
  expect(changed.notes).toHaveLength(2);
  expect(changed.connections).toHaveLength(2);
  expect(changed.nodes[0].position.y).toBeGreaterThan(changed.notes![1].position.y);
  expect(
    applyBoardOperations(changed, [{ type: 'removeStep', id: 'test' }]).connections,
  ).toHaveLength(0);
});
it('拒绝悬空、自连、重复、越权仓库移除、锁定和坐标越界，整批失败不产生部分修改', () => {
  expect(() => applyBoardOperations(board, [{ type: 'removeStep', id: 'repo' }])).toThrow();
  expect(() =>
    applyBoardOperations(board, [
      { type: 'connect', id: 'x', source: 'repo', target: 'missing', label: '' },
    ]),
  ).toThrow();
  expect(() =>
    applyBoardOperations(board, [
      { type: 'connect', id: 'x', source: 'repo', target: 'repo', label: '' },
    ]),
  ).toThrow();
  expect(() =>
    applyBoardOperations(board, [
      { type: 'connect', id: 'x', source: 'start', target: 'repo', label: 'go' },
    ]),
  ).toThrow();
  expect(() =>
    applyBoardOperations({ ...board, layoutLocked: true }, [{ type: 'removeStep', id: 'start' }]),
  ).toThrow('assistantBoardLocked');
  expect(() =>
    applyBoardOperations(board, [
      { type: 'moveElement', id: 'repo', position: { x: 100001, y: 0 } },
    ]),
  ).toThrow();
  expect(board.notes).toHaveLength(1);
});
it('移动视角保持计划有效，编辑内容使计划失效', () => {
  expect(boardSignature({ ...board, viewport: { x: 10, y: 20, zoom: 2 } })).toBe(
    boardSignature(board),
  );
  expect(boardSignature({ ...board, name: 'Changed' })).not.toBe(boardSignature(board));
});

it('布局保持并行分支在同层，回路可整理且不改变连线语义', () => {
  const branching: Board = {
    ...board,
    nodes: [],
    notes: ['a', 'b', 'c'].map((id) => ({ id, title: id, text: '', position: { x: 0, y: 0 } })),
    connections: [
      { id: 'ab', source: 'a', target: 'b', label: 'yes' },
      { id: 'ac', source: 'a', target: 'c', label: 'no' },
    ],
  };
  const after = applyBoardOperations(branching, [{ type: 'arrange', direction: 'vertical' }]);
  expect(after.notes![1].position.y).toBe(after.notes![2].position.y);
  expect(after.notes![1].position.x).not.toBe(after.notes![2].position.x);
  expect(after.connections).toEqual(branching.connections);
  const loop = {
    ...branching,
    connections: [
      ...branching.connections!,
      { id: 'ba', source: 'b', target: 'a', label: 'retry' },
    ],
  };
  expect(
    applyBoardOperations(loop, [{ type: 'arrange', direction: 'horizontal' }]).connections,
  ).toEqual(loop.connections);
});

it('流程图上下文超限或引用错误时不调用模型', async () => {
  let calls = 0;
  let selected = { ...board, description: 'x'.repeat(200001) };
  const service = new AssistantService({
    repository: async () => {
      throw new Error('Not used');
    },
    board: async () => ({ board: selected, repositoryNames: {} }),
    complete: async () => {
      calls++;
      return '';
    },
  });
  const input = {
    repositoryIds: [],
    boardId: 'b',
    prompt: 'Explain',
    language: 'en' as const,
    history: [],
    includeStagedDiff: false,
  };
  await expect(service.chat(input)).rejects.toMatchObject({ code: 'assistantBoardCapacity' });
  selected = { ...board, id: 'other' };
  await expect(service.chat(input)).rejects.toMatchObject({ code: 'assistantBoardInvalid' });
  expect(calls).toBe(0);
});

it('整理把仓库分组作为整体，保持成员相对位置且流程步骤在组外', () => {
  const grouped: Board = {
    id: 'g-board',
    name: 'Grouped',
    description: '',
    edges: [],
    nodes: [
      { id: 'r1', repoId: 'one', position: { x: 0, y: 0 } },
      { id: 'r2', repoId: 'two', position: { x: 340, y: 0 } },
    ],
    groups: [{ id: 'group', name: 'Repos', nodeIds: ['r1', 'r2'], collapsed: false }],
    notes: [{ id: 'step', title: 'Test', text: '', kind: 'process', position: { x: 0, y: 200 } }],
    connections: [
      { id: 'a', source: 'r1', target: 'step', label: '' },
      { id: 'b', source: 'step', target: 'r2', label: '' },
    ],
  };
  for (const collapsed of [false, true]) {
    grouped.groups![0].collapsed = collapsed;
    const after = applyBoardOperations(grouped, [{ type: 'arrange', direction: 'vertical' }]);
    expect(after.nodes[1].position.x - after.nodes[0].position.x).toBe(340);
    expect(after.nodes[1].position.y - after.nodes[0].position.y).toBe(0);
    expect(after.notes![0].position.y).toBeGreaterThan(after.nodes[0].position.y + 148 + 24);
    expect(after.groups).toEqual(grouped.groups);
  }
});

it('无仓库时也能解读并生成流程图计划；计划不写入白板，模型不接收仓库路径', async () => {
  let messages = '';
  let response: unknown = {
    text: 'Ready',
    operations: [],
    boardOperations: [{ type: 'updateStep', id: 'start', title: 'Review' }],
  };
  const service = new AssistantService({
    repository: async () => {
      throw new Error('No Git access expected');
    },
    board: async () => ({ board, repositoryNames: { one: 'Demo' } }),
    complete: async (input) => {
      messages = JSON.stringify(input);
      return JSON.stringify(response);
    },
  });
  const input = {
    repositoryIds: [],
    boardId: 'b',
    prompt: 'Rename the start step',
    language: 'en' as const,
    history: [],
    includeStagedDiff: false,
  };
  const result = await service.chat(input);
  expect(result.plan).toBeUndefined();
  expect(result.boardPlan?.operations).toHaveLength(1);
  expect(board.notes![0].title).toBe('Start');
  expect(messages).toContain('Demo');
  expect(messages).toContain('selectedBoard');
  response = { text: 'Explain', operations: [] };
  expect((await service.chat(input)).boardPlan).toBeUndefined();
  response = {
    text: 'Invalid',
    operations: [],
    boardOperations: [{ type: 'removeStep', id: 'repo' }],
  };
  await expect(service.chat(input)).rejects.toMatchObject({ code: 'assistantBoardInvalid' });
  await expect(service.chat({ ...input, boardId: undefined })).rejects.toMatchObject({
    code: 'assistantScope',
  });
});
it('模型返回期间白板改变时拒绝旧计划', async () => {
  let changed = false;
  const service = new AssistantService({
    repository: async () => {
      throw new Error('Not used');
    },
    board: async () => ({
      board: changed ? { ...board, name: 'New' } : board,
      repositoryNames: {},
    }),
    complete: async () => {
      changed = true;
      return JSON.stringify({
        text: 'Ready',
        operations: [],
        boardOperations: [{ type: 'removeStep', id: 'start' }],
      });
    },
  });
  await expect(
    service.chat({
      repositoryIds: [],
      boardId: 'b',
      prompt: 'remove start',
      language: 'en',
      history: [],
      includeStagedDiff: false,
    }),
  ).rejects.toMatchObject({ code: 'assistantBoardChanged' });
});
