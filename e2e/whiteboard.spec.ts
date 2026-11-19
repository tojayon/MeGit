import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './test';
import { dragConnection } from './connection-helpers';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';
import type { Board, Workspace } from '../shared/types';

async function readWorkspace(request: APIRequestContext): Promise<Workspace> {
  const { token } = await (await request.get('/api/session')).json();
  return (await request.get('/api/workspace', { headers: { 'X-MeGit-Token': token } })).json();
}
async function seed(request: APIRequestContext, paths: string[]) {
  const workspace = await readWorkspace(request);
  const { token } = await (await request.get('/api/session')).json();
  const board: Board = {
    id: 'whiteboard',
    name: 'MeGit 产品族',
    description: '',
    nodes: paths.map((_p, i) => ({
      id: ['a', 'b', 'c', 'd'][i],
      repoId: `r${i}`,
      position: [
        { x: 100, y: 180 },
        { x: 480, y: 180 },
        { x: 1000, y: 260 },
        { x: 1000, y: 650 },
      ][i],
    })),
    edges: [
      {
        id: 'ab',
        source: 'a',
        target: 'b',
        kind: 'dependency',
        label: '内部依赖',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
      {
        id: 'ac',
        source: 'a',
        target: 'c',
        kind: 'integration',
        label: '公共整合',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
      {
        id: 'bc',
        source: 'b',
        target: 'c',
        kind: 'delivery',
        label: '服务交付',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
    ],
  };
  const response = await request.put('/api/workspace', {
    headers: { 'X-MeGit-Token': token },
    data: {
      ...workspace,
      activeBoardId: board.id,
      boards: [board],
      repositories: paths.map((p, i) => ({
        id: `r${i}`,
        name: ['公共库', '前端', '服务端', '独立工具'][i],
        path: p,
      })),
    },
  });
  expect(response.ok()).toBe(true);
}

test('分组创建、整体移动、折叠投影、刷新恢复和解散保留仓库', async ({ page, request }) => {
  const f = await fixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await commitFile(f.repo);
    const paths = [f.repo];
    for (const name of ['frontend', 'service', 'tool']) {
      const p = path.join(f.root, name);
      await git(f.root, 'clone', f.repo, p);
      paths.push(p);
    }
    await seed(request, paths);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await expect(page.getByTestId('repository-node')).toHaveCount(4);
    await page.getByRole('button', { name: '仓库分组', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建仓库分组' });
    await dialog.getByLabel('分组名称').fill('客户端');
    await dialog.getByRole('checkbox', { name: '公共库', exact: true }).check();
    await dialog.getByRole('checkbox', { name: '前端', exact: true }).check();
    await dialog.getByRole('button', { name: '保存分组' }).click();
    await expect(page.getByTestId('group-node')).toContainText('客户端');
    await page.locator('.outline-group-title').click();
    await expect(page.locator('dialog:has(.group-editor)')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '编辑分组', exact: true }).click();
    await page.getByLabel('分组名称').fill('MeGit 客户端');
    await page.getByRole('button', { name: '保存分组' }).click();
    const groupNode = page.locator('.react-flow__node-group');
    await groupNode.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].nodes[0].position.x)
      .toBe(110);
    expect((await readWorkspace(request)).boards[0].nodes[1].position.x).toBe(490);
    const heading = groupNode.locator('.group-heading');
    const box = await heading.boundingBox();
    if (!box) throw new Error('Group title missing');
    await page.mouse.move(box.x + 70, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 75, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    const moved = (await readWorkspace(request)).boards[0];
    expect(moved.nodes[0].position.x).toBeGreaterThan(110);
    expect(moved.nodes[1].position.x - moved.nodes[0].position.x).toBe(380);
    expect(moved.nodes[2].position).toEqual({ x: 1000, y: 260 });
    await page.screenshot({
      path: '.megit/verification/whiteboard/groups-dark-zh.png',
      animations: 'disabled',
    });
    await groupNode.getByRole('button', { name: '折叠MeGit 客户端' }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /公共整合.*已包含/ })).toBeVisible();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/whiteboard/collapsed-dark-zh.png',
      animations: 'disabled',
    });
    await page.reload();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    expect((await readWorkspace(request)).boards[0].edges).toEqual(moved.edges);
    await page.getByRole('button', { name: /公共整合.*已包含/ }).click();
    await expect(page.getByRole('complementary', { name: '流程关系详情' })).toContainText('公共库');
    await expect(page.getByRole('complementary', { name: '流程关系详情' })).toContainText('服务端');
    await page.getByRole('button', { name: '关闭关系详情' }).click();
    await page.getByRole('button', { name: '展开MeGit 客户端' }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(4);
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    expect((await readWorkspace(request)).boards[0].nodes).toEqual(moved.nodes);
    await groupNode.click({ position: { x: 70, y: 20 } });
    await page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '移除所选元素', exact: true })
      .click();
    await expect(page.getByTestId('group-node')).toHaveCount(0);
    await expect(page.getByTestId('repository-node')).toHaveCount(4);
    await expect(page.locator('.react-flow__edge')).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test('连线路由与四边端口持久化，上下游强调，双语主题与背景检查器', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const paths = [f.repo];
    for (const name of ['frontend', 'service', 'tool']) {
      const p = path.join(f.root, name);
      await git(f.root, 'clone', f.repo, p);
      paths.push(p);
    }
    await seed(request, paths);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    const repo = page.getByTestId('repository-node').filter({ hasText: '公共库' });
    await expect(repo.locator('.react-flow__handle')).toHaveCount(8);
    await expect(repo).not.toContainText(paths[0]);
    await page.getByRole('button', { name: '查看公共库', exact: true }).click();
    await expect(page.locator('.react-flow__edge[data-id="ac"]')).toHaveClass(/context-related/);
    await expect(page.locator('.react-flow__node[data-id="d"]')).not.toHaveClass(/context-related/);
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: '适应白板', exact: true }).click();
    await dragConnection(
      page,
      page.locator(
        '.react-flow__node[data-id="b"] .react-flow__handle[data-handleid="source-bottom"]',
      ),
      page.locator('.react-flow__node[data-id="d"] .react-flow__handle[data-handleid="target-top"]'),
    );
    await page.getByLabel('关系名称').fill('从下到上');
    await page.getByRole('button', { name: '保存关系', exact: true }).click();
    await page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '编辑关系', exact: true })
      .click();
    await expect(page.getByLabel('来源连接点', { exact: true })).toHaveValue('bottom');
    await expect(page.getByLabel('目标连接点', { exact: true })).toHaveValue('top');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '关闭关系详情' }).click();
    await page.getByRole('button', { name: '查看公共库', exact: true }).click();
    await expect(page.locator('.react-flow__edge[data-id="ac"]')).toHaveClass(/context-related/);
    await expect(page.locator('.react-flow__node[data-id="d"]')).toHaveClass(/context-related/);
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: /公共整合.*已包含/ }).click();
    const edge = page.locator('.workflow-edge-path#ac');
    const pathsByRouting = new Set<string>();
    for (const routing of ['bezier', 'straight', 'step', 'smoothstep']) {
      await page
        .locator('.canvas-selection-tools')
        .getByRole('button', { name: '编辑关系', exact: true })
        .click();
      await page.getByLabel('连线样式', { exact: true }).selectOption(routing);
      await page.getByRole('button', { name: '保存关系', exact: true }).click();
      await expect
        .poll(async () => (await readWorkspace(request)).boards[0].edges[1].routing)
        .toBe(routing);
      pathsByRouting.add((await edge.getAttribute('d')) || '');
    }
    expect(pathsByRouting.size).toBe(4);
    await page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '编辑关系', exact: true })
      .click();
    await page.getByLabel('来源连接点', { exact: true }).selectOption('bottom');
    await page.getByLabel('目标连接点', { exact: true }).selectOption('top');
    await page.getByLabel('关系名称').fill('保留连接设置');
    await page.getByRole('button', { name: '保存关系', exact: true }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /保留连接设置.*已包含/ }).click();
    await page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '编辑关系', exact: true })
      .click();
    await expect(page.getByLabel('来源连接点', { exact: true })).toHaveValue('bottom');
    await expect(page.getByLabel('目标连接点', { exact: true })).toHaveValue('top');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '关闭关系详情' }).click();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences' }).click();
    await page.getByRole('button', { name: 'Board details', exact: true }).click();
    const boardEditor = page.getByRole('dialog', { name: 'Board details', exact: true });
    await boardEditor.getByLabel('Workflow description').fill('跨仓库的开发流程');
    await boardEditor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/whiteboard/board-light-en.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      boardEditor.getByRole('button', { name: 'Close board details', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await boardEditor.getByRole('button', { name: 'Close board details', exact: true }).click();
    await page.getByRole('button', { name: 'Group repositories', exact: true }).click();
    await page.getByLabel('Group name').fill('Clients');
    await page.getByRole('checkbox', { name: '公共库', exact: true }).check();
    await page.getByRole('checkbox', { name: '前端', exact: true }).check();
    await page.getByRole('button', { name: 'Save group' }).click();
    await page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: 'Edit group', exact: true })
      .click();
    await expect(page.locator('dialog:has(.group-editor)')).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/whiteboard/group-mobile-light-en.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close group details' }).click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    await expect
      .poll(async () =>
        Number((await page.locator('.canvas-zoom-label').innerText()).replace('%', '')),
      )
      .toBeGreaterThan(60);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/whiteboard/groups-light-en.png',
      animations: 'disabled',
    });
  } finally {
    await f.cleanup();
  }
});

test('白板弹窗保存名称和说明，关闭重开后保留且不创建 Git 详情', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '白板详情', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '白板详情', exact: true });
  await panel.getByLabel('流程说明').fill('新流程说明');
  await panel.getByLabel('流程名称').fill('重命名后的流程');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].name)
    .toBe('重命名后的流程');
  expect((await readWorkspace(request)).boards[0].description).toBe('新流程说明');
  await panel.getByRole('button', { name: '关闭白板详情', exact: true }).click();
  await page.getByRole('button', { name: '白板详情', exact: true }).click();
  await expect(panel.getByLabel('流程说明')).toHaveValue('新流程说明');
  await expect(page.locator('.dock-card')).toHaveCount(0);
});

test('仓库索引跨白板跳转时展开目标仓库的折叠组', async ({ page, request }) => {
  const f = await fixture();
  try {
    const workspace = await readWorkspace(request);
    workspace.repositories = [{ id: 'repo', name: '隐藏的仓库', path: f.repo }];
    workspace.boards.push({
      id: 'other',
      name: '另一白板',
      description: '',
      nodes: [{ id: 'hidden', repoId: 'repo', position: { x: 100, y: 100 } }],
      edges: [],
      groups: [{ id: 'collapsed', name: '折叠分组', nodeIds: ['hidden'], collapsed: true }],
    });
    const { token } = await (await request.get('/api/session')).json();
    expect(
      (
        await request.put('/api/workspace', {
          headers: { 'X-MeGit-Token': token },
          data: workspace,
        })
      ).ok(),
    ).toBe(true);
    await page.goto('/');
    await page.getByRole('button', { name: '仓库索引', exact: true }).click();
    await page
      .getByRole('dialog', { name: '仓库索引' })
      .getByRole('button', { name: /隐藏的仓库/ })
      .click();
    await expect(page.getByTestId('repository-node')).toHaveCount(1);
    await expect(page.getByRole('complementary', { name: '隐藏的仓库 仓库详情' })).toBeVisible();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[1].groups![0].collapsed)
      .toBe(false);
  } finally {
    await f.cleanup();
  }
});
