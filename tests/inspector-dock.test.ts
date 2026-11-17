import { describe, expect, it } from 'vitest';
import {
  closeInspector,
  dockBounds,
  emptyDock,
  inspectorKey,
  openInspector,
  reconcileInspectors,
} from '../src/lib/inspector-dock';

describe('多详情区域的独立状态', () => {
  it('同一白板的不同类型并排保留，重复打开只定位原详情', () => {
    let state = openInspector(emptyDock, 'a', { kind: 'repository', id: 'r' });
    state = openInspector(state, 'a', { kind: 'relation', id: 'r' });
    state = openInspector(state, 'a', { kind: 'repository', id: 'r' });
    expect(state.items.map(inspectorKey)).toEqual(['repository:r', 'relation:r']);
    expect(state.active).toBe('repository:r');
    expect(state.request).toBe(3);
  });
  it('关闭单个详情保留其他项，关闭当前项后选择相邻项', () => {
    let state = openInspector(emptyDock, 'a', { kind: 'repository', id: '1' });
    state = openInspector(state, 'a', { kind: 'relation', id: '2' });
    state = openInspector(state, 'a', { kind: 'repository', id: '3' });
    state = closeInspector(state, 'relation:2');
    expect(state.active).toBe('repository:3');
    state = closeInspector(state, 'repository:3');
    expect(state.active).toBe('repository:1');
    expect(closeInspector(state, 'repository:1').items).toEqual([]);
  });
  it('切换白板打开新详情时不混入旧白板项，并忽略迟到的旧白板清理', () => {
    const a = openInspector(emptyDock, 'a', { kind: 'repository', id: '1' });
    const b = openInspector(a, 'b', { kind: 'repository', id: '2' });
    expect(b.items).toEqual([{ kind: 'repository', id: '2' }]);
    expect(reconcileInspectors(b, 'a', [])).toBe(b);
  });
  it('删除后清理失效项，更新名称和状态不重新创建实例', () => {
    let state = openInspector(emptyDock, 'a', { kind: 'repository', id: '1' });
    state = openInspector(state, 'a', { kind: 'relation', id: '2' });
    expect(reconcileInspectors(state, 'a', ['repository:1', 'relation:2'])).toBe(state);
    const cleaned = reconcileInspectors(state, 'a', ['repository:1']);
    expect(cleaned.items).toEqual([{ kind: 'repository', id: '1' }]);
    expect(cleaned.active).toBe('repository:1');
  });
  it('区域最多占窗口 2/3，窄屏仍有限定宽度且不会出现负数', () => {
    expect(dockBounds(1440)).toEqual({ min: 320, max: 960 });
    expect(dockBounds(390)).toEqual({ min: 260, max: 260 });
    expect(dockBounds(320)).toEqual({ min: 213, max: 213 });
    expect(dockBounds(0)).toEqual({ min: 0, max: 0 });
  });
});
