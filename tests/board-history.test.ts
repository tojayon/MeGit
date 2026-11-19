import { describe, expect, it } from 'vitest';
import type { Workspace } from '../shared/types';
import { BoardHistory } from '../src/lib/board-history';

const workspace = (): Workspace => ({
  version: 1,
  revision: 10,
  activeBoardId: 'a',
  repositories: [],
  boards: ['a', 'b'].map((id) => ({ id, name: id, description: '', nodes: [], edges: [] })),
});

describe('白板历史', () => {
  it('步骤与流程线共同撤销，清理新增字段并可以重做', () => {
    const history = new BoardHistory();
    const before = workspace();
    const next = structuredClone(before);
    next.boards[0].notes = [
      {
        id: 'step',
        kind: 'decision',
        title: '通过？',
        summary: '判断',
        text: '细节',
        position: { x: 0, y: 0 },
      },
    ];
    next.boards[0].connections = [{ id: 'flow', source: 'step', target: 'next', label: '通过' }];
    history.record(before, next);
    const undone = history.undo(next, 'a')!;
    expect(undone.boards[0].notes).toBeUndefined();
    expect(undone.boards[0].connections).toBeUndefined();
    expect(history.redo(undone, 'a')!.boards[0].connections).toEqual(next.boards[0].connections);
  });
  it('隔离各白板，保留最新 revision、视角、锁定与仓库登记，不重演 Git 操作', () => {
    const history = new BoardHistory();
    const before = workspace();
    const next = structuredClone(before);
    next.boards[0].description = '说明';
    history.record(before, next);
    const other = structuredClone(next);
    other.boards[1].name = 'Other';
    history.record(next, other);
    other.revision = 27;
    other.repositories.push({ id: 'repo', name: 'Repo', path: 'C:/private' });
    other.boards[0].viewport = { x: 20, y: 50, zoom: 0.6 };
    other.boards[0].layoutLocked = true;
    const undone = history.undo(other, 'a')!;
    expect(undone).toMatchObject({ revision: 27, repositories: other.repositories });
    expect(undone.boards[0]).toMatchObject({
      description: '',
      layoutLocked: true,
      viewport: other.boards[0].viewport,
    });
    expect(undone.boards[1].name).toBe('Other');
    expect(history.redo(undone, 'a')!.boards[0].description).toBe('说明');
  });

  it('忽略视角和锁定，无变化不入栈；新编辑清除重做，最多保留50次', () => {
    const history = new BoardHistory();
    let current = workspace();
    const view = structuredClone(current);
    view.boards[0].viewport = { x: 10, y: 20, zoom: 1 };
    view.boards[0].layoutLocked = true;
    history.record(current, view);
    expect(history.canUndo('a')).toBe(false);
    current = view;
    for (let i = 1; i <= 55; i++) {
      const next = structuredClone(current);
      next.boards[0].description = String(i);
      history.record(current, next);
      current = next;
    }
    for (let i = 0; i < 50; i++) current = history.undo(current, 'a')!;
    expect(current.boards[0].description).toBe('5');
    expect(history.canUndo('a')).toBe(false);
    expect(history.canRedo('a')).toBe(true);
    const edit = structuredClone(current);
    edit.boards[0].name = 'new';
    history.record(current, edit);
    expect(history.canRedo('a')).toBe(false);
  });
});
