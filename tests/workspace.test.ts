import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixtures.js';
import { WorkspaceStore, workspaceSchema } from '../server/workspace.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});

describe('流程持久化', () => {
  it('保存步骤形状、摘要与独立流程线，重读不丢失，也不允许悬空端点', async () => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const directory = path.join(f.root, 'flowchart');
    const store = new WorkspaceStore(directory);
    const initial = await store.read();
    const board = {
      ...initial.boards[0],
      notes: [
        {
          id: 'start',
          title: '开始',
          text: '完整操作',
          summary: '选择变更',
          kind: 'start',
          position: { x: 0, y: 0 },
        },
        { id: 'gate', title: '通过？', text: '', kind: 'decision', position: { x: 300, y: 0 } },
      ],
      connections: [
        {
          id: 'flow',
          source: 'start',
          target: 'gate',
          label: '下一步',
          sourcePort: 'right',
          targetPort: 'left',
          waypoints: [{ x: 260, y: 32 }],
        },
      ],
    };
    const saved = await store.save({ ...initial, boards: [board] });
    expect((await new WorkspaceStore(directory).read()).boards[0]).toEqual(board);
    const invalid = structuredClone(saved);
    invalid.boards[0].connections![0].target = 'missing';
    await expect(store.save(invalid)).rejects.toMatchObject({ code: 'invalidEdge' });
    invalid.boards[0].connections![0].target = 'start';
    await expect(store.save(invalid)).rejects.toMatchObject({ code: 'invalidEdge' });
    invalid.boards[0].connections![0].target = 'gate';
    invalid.boards[0].connections![0].target = 'group';
    await expect(store.save(invalid)).rejects.toMatchObject({ code: 'invalidEdge' });
    invalid.boards[0].connections![0].target = 'gate';
    invalid.boards[0].connections!.push(invalid.boards[0].connections![0]);
    await expect(store.save(invalid)).rejects.toMatchObject({ code: 'duplicateRelation' });
  });
  it('保存独立人工说明与布局锁定，说明不能充当仓库关系端点或重复标识', async () => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const directory = path.join(f.root, 'notes');
    const store = new WorkspaceStore(directory);
    const initial = await store.read();
    const data = structuredClone(initial);
    data.boards[0].notes = [
      { id: 'note', title: '规划', text: '人工维护', position: { x: 80, y: -60 } },
    ];
    data.boards[0].layoutLocked = true;
    const saved = await store.save(data);
    expect((await new WorkspaceStore(directory).read()).boards[0]).toMatchObject({
      notes: data.boards[0].notes,
      layoutLocked: true,
    });
    saved.boards[0].edges.push({
      id: 'e',
      source: 'note',
      target: 'missing',
      kind: 'dependency',
      label: '',
      sourceRef: 'HEAD',
      targetRef: 'HEAD',
    });
    await expect(store.save(saved)).rejects.toMatchObject({ code: 'invalidEdge' });
    saved.boards[0].edges = [];
    saved.boards[0].notes!.push(saved.boards[0].notes![0]);
    await expect(store.save(saved)).rejects.toMatchObject({ code: 'duplicateNode' });
    saved.boards[0].notes = [{ ...data.boards[0].notes[0], text: 'x'.repeat(2001) }];
    await expect(store.save(saved)).rejects.toMatchObject({ code: 'invalidWorkspace' });
  });
  it('保存布局和连线，重新打开后保持一致；过期页面不能覆盖新状态', async () => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const store = new WorkspaceStore(path.join(f.root, 'state'));
    const initial = await store.read();
    const repoId = randomUUID();
    const next = structuredClone(initial);
    next.repositories.push({ id: repoId, name: 'Example', path: f.repo.replaceAll('\\', '/') });
    next.boards[0].nodes.push({ id: 'node-one', repoId, position: { x: 120, y: 200 } });
    const saved = await store.save(next);
    expect(saved.revision).toBe(initial.revision + 1);
    expect(
      (await new WorkspaceStore(path.join(f.root, 'state')).read()).boards[0].nodes[0].position,
    ).toEqual({ x: 120, y: 200 });
    await expect(store.save(initial)).rejects.toMatchObject({ status: 409 });
  });

  it('拒绝悬空连线、重复节点、非 Git 路径和重复的规范化仓库路径', async () => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const store = new WorkspaceStore(path.join(f.root, 'state'));
    const initial = await store.read();
    const next = structuredClone(initial);
    next.boards[0].edges.push({
      id: 'edge',
      source: 'missing',
      target: 'missing2',
      kind: 'dependency',
      label: '依赖',
      sourceRef: 'HEAD',
      targetRef: 'HEAD',
    });
    await expect(store.save(next)).rejects.toThrow();
    next.boards[0].edges = [];
    next.repositories.push({ id: 'bad', name: 'Bad', path: f.root });
    await expect(store.save(next)).rejects.toThrow();
    next.repositories = [
      { id: 'a', name: 'A', path: f.repo },
      { id: 'b', name: 'B', path: f.repo },
    ];
    await expect(store.save(next)).rejects.toThrow('重复');
  });

  it('兼容没有分组和路由的旧白板，并保留新路由和四边端口', () => {
    const legacy = {
      version: 1,
      revision: 0,
      activeBoardId: 'b',
      repositories: [],
      boards: [{ id: 'b', name: 'Board', description: '', nodes: [], edges: [] }],
    };
    expect(workspaceSchema.parse(legacy)).toEqual(legacy);
    const relation = {
      id: 'e',
      source: 'a',
      target: 'b',
      kind: 'dependency',
      label: '',
      sourceRef: 'HEAD',
      targetRef: 'HEAD',
      routing: 'smoothstep',
      sourcePort: 'bottom',
      targetPort: 'top',
    };
    const parsed = workspaceSchema.parse({
      ...legacy,
      boards: [{ ...legacy.boards[0], edges: [relation] }],
    });
    expect(parsed.boards[0].edges[0]).toEqual(relation);
    expect(
      workspaceSchema.safeParse({
        ...legacy,
        boards: [{ ...legacy.boards[0], edges: [{ ...relation, sourcePort: 'diagonal' }] }],
      }).success,
    ).toBe(false);
  });

  it('分组保存重读后名称、成员和折叠状态不变，不改变原节点坐标', async () => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const directory = path.join(f.root, 'groups');
    const store = new WorkspaceStore(directory);
    const initial = await store.read();
    const group = { id: 'g', name: 'Frontend', nodeIds: ['n'], collapsed: true };
    const node = { id: 'n', repoId: 'r', position: { x: 170, y: -250 } };
    const next = {
      ...initial,
      repositories: [{ id: 'r', name: 'Repo', path: f.repo }],
      boards: [{ ...initial.boards[0], nodes: [node], groups: [group] }],
    };
    await store.save(next);
    const loaded = await new WorkspaceStore(directory).read();
    expect(loaded.boards[0]).toMatchObject({ nodes: [node], groups: [group] });
  });

  it.each([
    [{ id: 'g', nodeIds: ['missing'] }],
    [{ id: 'g', nodeIds: ['n', 'n'] }],
    [{ id: 'g', nodeIds: [] }],
    [{ id: 'n', nodeIds: ['n'] }],
    [
      { id: 'g', nodeIds: ['n'] },
      { id: 'g', nodeIds: ['n'] },
    ],
    [
      { id: 'g', nodeIds: ['n'] },
      { id: 'g2', nodeIds: ['n'] },
    ],
  ])('拒绝无效分组引用或重复成员 %#', async (...groups) => {
    const f = await fixture();
    cleanups.push(f.cleanup);
    const store = new WorkspaceStore(path.join(f.root, 'invalid-groups'));
    const initial = await store.read();
    const data = {
      ...initial,
      repositories: [{ id: 'r', name: 'Repo', path: f.repo }],
      boards: [
        {
          ...initial.boards[0],
          nodes: [{ id: 'n', repoId: 'r', position: { x: 0, y: 0 } }],
          groups: groups.map((g) => ({ name: 'Group', collapsed: false, ...g })),
        },
      ],
    };
    await expect(store.save(data)).rejects.toMatchObject({ code: 'invalidGroup' });
  });
});
