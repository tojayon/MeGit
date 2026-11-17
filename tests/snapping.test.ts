import { describe, expect, it } from 'vitest';
import type { Board } from '../shared/types';
import { createSnapScene, snapMove } from '../src/lib/snapping';

function board(points: [string, number, number][]): Board {
  return {
    id: 'test',
    name: 'test',
    description: '',
    nodes: [],
    edges: [],
    notes: points.map(([id, x, y]) => ({ id, title: id, text: '', position: { x, y } })),
  };
}
const sizes = { moving: { width: 100, height: 80 }, target: { width: 140, height: 120 } };
const fixture = () =>
  createSnapScene(
    board([
      ['moving', 0, 0],
      ['target', 300, 200],
    ]),
    ['moving'],
    sizes,
  )!;

describe('拖动智能吸附', () => {
  it.each([
    ['left', 'x', 300],
    ['center', 'x', 320],
    ['right', 'x', 340],
    ['top', 'y', 200],
    ['middle', 'y', 220],
    ['bottom', 'y', 240],
  ] as const)('不同大小的元素精确%s对齐', (_label, axis, expected) => {
    const result = snapMove(fixture(), { x: 20, y: 20, [axis]: expected + 4 }, 1);
    expect(result.delta[axis]).toBe(expected);
    expect(result.guides.some((line) => line.kind === 'align')).toBe(true);
  });

  it('阈值以屏幕像素计算，缩放不会改变吸附距离', () => {
    expect(snapMove(fixture(), { x: 310, y: 20 }, 0.5).delta.x).toBe(300);
    expect(snapMove(fixture(), { x: 304, y: 20 }, 2).delta.x).toBe(304);
    expect(snapMove(fixture(), { x: 340, y: 20 }, 2).delta.x).toBe(340);
  });

  it('已经匹配的参考线有释放范围，离开范围后自由移动', () => {
    const first = snapMove(fixture(), { x: 304, y: 20 }, 1);
    const held = snapMove(fixture(), { x: 308, y: 20 }, 1, first.locks);
    expect(held.delta.x).toBe(300);
    expect(snapMove(fixture(), { x: 311, y: 20 }, 1, held.locks).delta.x).toBe(311);
  });

  it('可以在两元素之间形成相等间距，也能延续已有间距', () => {
    const dimensions = Object.fromEntries(
      ['a', 'b', 'moving'].map((id) => [id, { width: 100, height: 80 }]),
    );
    const between = createSnapScene(
      board([
        ['a', 0, 100],
        ['b', 400, 100],
        ['moving', 100, 300],
      ]),
      ['moving'],
      dimensions,
    )!;
    const middle = snapMove(between, { x: 104, y: -200 }, 1);
    expect(middle.delta.x).toBe(100);
    expect(middle.guides.filter((line) => line.kind === 'gap')).toHaveLength(2);
    const extension = createSnapScene(
      board([
        ['a', 0, 100],
        ['b', 180, 100],
        ['moving', 400, 260],
      ]),
      ['moving'],
      dimensions,
    )!;
    expect(snapMove(extension, { x: -36, y: -160 }, 1).delta.x).toBe(-40);
    expect(snapMove(extension, { x: -576, y: -160 }, 1).delta.x).toBe(-580);
  });

  it('竖向同样支持等间距', () => {
    const source = board([
      ['a', 100, 0],
      ['b', 100, 400],
      ['moving', 300, 100],
    ]);
    const dimensions = Object.fromEntries(
      ['a', 'b', 'moving'].map((id) => [id, { width: 100, height: 100 }]),
    );
    const result = snapMove(
      createSnapScene(source, ['moving'], dimensions)!,
      { x: -200, y: 104 },
      1,
    );
    expect(result.delta.y).toBe(100);
    expect(result.guides.filter((line) => line.kind === 'gap')).toHaveLength(2);
  });

  it('多选按整体边界吸附，成员保持相对位置', () => {
    const source = board([
      ['a', 0, 0],
      ['b', 180, 100],
      ['target', 400, 200],
    ]);
    const dimensions = Object.fromEntries(
      ['a', 'b', 'target'].map((id) => [id, { width: 100, height: 80 }]),
    );
    const scene = createSnapScene(source, ['a', 'b'], dimensions)!;
    expect(scene.moving).toMatchObject({ x: 0, y: 0, width: 280, height: 180 });
    expect(scene.targets.map((target) => target.id)).toEqual(['target']);
    expect(snapMove(scene, { x: 404, y: 0 }, 1).delta.x).toBe(400);
  });

  it('分组用可见外框吸附，排除自己与成员；成员拖动排除变化中的父组', () => {
    const source = board([['note', 0, 600]]);
    source.nodes = [
      { id: 'a', repoId: 'a', position: { x: 100, y: 200 } },
      { id: 'b', repoId: 'b', position: { x: 500, y: 200 } },
    ];
    source.groups = [{ id: 'g', name: 'g', nodeIds: ['a', 'b'], collapsed: true }];
    const scene = createSnapScene(source, ['g'])!;
    expect(scene.moving).toMatchObject({ x: 76, y: 144, width: 300, height: 100 });
    expect(scene.targets.map((target) => target.id)).toEqual(['note']);
    source.groups[0].collapsed = false;
    const member = createSnapScene(source, ['a'])!;
    expect(member.targets.map((target) => target.id).sort()).toEqual(['b', 'note']);
  });

  it('隐藏节点和折叠成员不参与参考，远处元素也不牵引', () => {
    const source = board([
      ['moving', 0, 0],
      ['hidden', 300, 0],
      ['target', 300, 5000],
    ]);
    const scene = createSnapScene(source, ['moving'], {}, ['moving', 'target'])!;
    expect(scene.targets.map((target) => target.id)).toEqual(['target']);
    expect(snapMove(scene, { x: 304, y: 0 }, 1).delta.x).toBe(304);
  });

  it('共同限幅不让参考线伪装成已经对齐；锁定或空选择不创建场景', () => {
    const source = board([
      ['moving', 99999, 0],
      ['target', 100004, 200],
    ]);
    const scene = createSnapScene(source, ['moving'], sizes)!;
    const result = snapMove(scene, { x: 4, y: 0 }, 1);
    expect(result.delta.x).toBe(1);
    expect(result.locks.x).toBeUndefined();
    expect(createSnapScene(source, [])).toBeNull();
    source.layoutLocked = true;
    expect(createSnapScene(source, ['moving'])).toBeNull();
  });

  it('部分聚焦使折叠成员直接显示时，按实际可见投影参与吸附', () => {
    const source = board([['moving', 0, 0]]);
    source.nodes = [
      { id: 'a', repoId: 'a', position: { x: 300, y: 200 } },
      { id: 'b', repoId: 'b', position: { x: 700, y: 200 } },
    ];
    source.groups = [{ id: 'g', name: 'g', nodeIds: ['a', 'b'], collapsed: true }];
    const scene = createSnapScene(source, ['moving'], {}, ['moving', 'a'])!;
    expect(scene.targets.map((target) => target.id)).toEqual(['a']);
    expect(snapMove(scene, { x: 304, y: 0 }, 1).delta.x).toBe(300);
  });

  it('候选同距离时稳定选择，不受源数组顺序影响', () => {
    const first = board([
      ['moving', 0, 0],
      ['z', 300, 100],
      ['a', 308, 100],
    ]);
    const second = { ...first, notes: [...first.notes!].reverse() };
    const dimensions = Object.fromEntries(
      ['moving', 'a', 'z'].map((id) => [id, { width: 100, height: 80 }]),
    );
    const a = snapMove(createSnapScene(first, ['moving'], dimensions)!, { x: 304, y: 0 }, 1);
    const b = snapMove(createSnapScene(second, ['moving'], dimensions)!, { x: 304, y: 0 }, 1);
    expect(a).toEqual(b);
  });
});
