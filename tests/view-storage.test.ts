import { describe, expect, it, vi } from 'vitest';
import {
  createViewStorage,
  VIEW_STATE_KEY,
  isScrollPosition,
  viewKey,
} from '../src/lib/view-storage';
import { isInspectorState, emptyDock } from '../src/lib/inspector-dock';

function memory(raw: string | null = null) {
  const entries = new Map<string, string>(raw === null ? [] : [[VIEW_STATE_KEY, raw]]);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe('当前标签页的浏览记录', () => {
  it('刷新重新读取详情和位置，按白板与仓库隔离且不写其他存储键', () => {
    const storage = memory();
    const first = createViewStorage(() => storage);
    const a = viewKey('board-a', 'repo', 'map');
    const b = viewKey('board-b', 'repo', 'map');
    first.write(a, { left: 210, top: 360 });
    first.write(b, { left: 0, top: 40 });
    first.write('dock', { ...emptyDock, boardId: 'board-a' });
    const refreshed = createViewStorage(() => storage);
    expect(refreshed.read(a)).toEqual({ left: 210, top: 360 });
    expect(refreshed.read(b)).toEqual({ left: 0, top: 40 });
    expect(isInspectorState(refreshed.read('dock'))).toBe(true);
    expect(createViewStorage(() => memory()).read(a)).toBeUndefined();
    expect(storage.getItem('megit.preferences')).toBeNull();
  });

  it('单键订阅只响应自己的变更，清除和退订有效', () => {
    const storage = createViewStorage(() => memory());
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribe = storage.subscribe('a', a);
    storage.subscribe('b', b);
    storage.write('a', 'value');
    storage.write('a', 'value');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    storage.write('a', undefined);
    expect(storage.read('a')).toBeUndefined();
    unsubscribe();
    storage.write('a', 'later');
    expect(a).toHaveBeenCalledTimes(2);
  });

  it.each([
    'broken',
    'null',
    '{"version":2,"entries":[]}',
    '{"version":1,"entries":[[2,3]]}',
    JSON.stringify({
      version: 1,
      entries: Array.from({ length: 513 }, (_, i) => [String(i), true]),
    }),
    ' '.repeat(2_000_001),
  ])('损坏或超限记录安全回退：%#', (raw) => {
    const storage = createViewStorage(() => memory(raw));
    expect(storage.read('dock')).toBeUndefined();
    expect(storage.issue()).toBe('invalid');
  });

  it('存储不可用或写入失败时保留内存状态并通知问题', () => {
    for (const access of [
      () => {
        throw new Error('blocked');
      },
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ]) {
      const storage = createViewStorage(access);
      const listener = vi.fn();
      storage.subscribeIssue(listener);
      storage.write('open', true);
      expect(storage.read('open')).toBe(true);
      expect(storage.issue()).toBe('unavailable');
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });

  it('记录数量有界，原型字段作为普通键处理', () => {
    const backing = memory();
    const storage = createViewStorage(() => backing);
    storage.write('__proto__', { open: true });
    expect(storage.read('__proto__')).toEqual({ open: true });
    for (let i = 0; i < 513; i++) storage.write(String(i), i);
    expect(storage.read('0')).toBeUndefined();
    expect(storage.read('512')).toBe(512);
    expect(JSON.parse(backing.getItem(VIEW_STATE_KEY)!).entries).toHaveLength(512);
  });

  it('淘汰旧记录时保护仍打开的面板，活跃记录全部占满时保留内存并提示', () => {
    const storage = createViewStorage(() => memory());
    storage.write('dock', { ...emptyDock, boardId: 'open' });
    storage.subscribe('dock', () => {});
    for (let i = 0; i < 520; i++) storage.write(String(i), i);
    expect(storage.read('dock')).toMatchObject({ boardId: 'open' });
    const full = createViewStorage(() => memory());
    for (let i = 0; i < 513; i++) {
      full.subscribe(String(i), () => {});
      full.write(String(i), true);
    }
    expect(full.read('0')).toBe(true);
    expect(full.read('512')).toBe(true);
    expect(full.issue()).toBe('unavailable');
  });

  it('拒绝非有限坐标、负数、过大坐标和错误详情结构', () => {
    expect(isScrollPosition({ left: 12, top: 300 })).toBe(true);
    for (const value of [
      null,
      {},
      { left: -1, top: 0 },
      { left: 0, top: NaN },
      { left: Infinity, top: 0 },
      { left: 0, top: 10_000_001 },
    ])
      expect(isScrollPosition(value)).toBe(false);
    expect(isInspectorState({ ...emptyDock, items: [{ kind: 'delete', id: 'repo' }] })).toBe(false);
    expect(isInspectorState({ ...emptyDock, request: -1 })).toBe(false);
    expect(
      isInspectorState({
        ...emptyDock,
        items: [
          { kind: 'repository', id: 'repo' },
          { kind: 'repository', id: 'repo' },
        ],
      }),
    ).toBe(false);
  });
});
