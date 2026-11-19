import { openRepositoryTools } from './branch-tree-helpers';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Board, Workspace } from '../shared/types';
import { fixture, commitFile, git } from '../tests/fixtures';

const evidence = '.megit/verification/whiteboard-tools';
async function readWorkspace(request: APIRequestContext): Promise<Workspace> {
  const { token } = await (await request.get('/api/session')).json();
  return (await request.get('/api/workspace', { headers: { 'X-MeGit-Token': token } })).json();
}
async function seed(request: APIRequestContext, paths: string[] = []) {
  const current = await readWorkspace(request);
  const board: Board = {
    id: 'tools',
    name: 'MeGit 设计',
    description: '',
    edges: [],
    nodes: [],
    notes: [
      {
        id: 'n1',
        title: '开发计划',
        text: '跨仓库协作\n先验证，再发布。',
        position: { x: 200, y: 180 },
      },
      { id: 'n2', title: '待办清单', text: '人工维护的事项', position: { x: 560, y: 300 } },
      { id: 'n3', title: '发布窗口', text: '周五下午', position: { x: 1120, y: 180 } },
    ],
  };
  if (paths.length) {
    board.nodes = paths.map((_p, i) => ({
      id: ['a', 'b', 'c'][i],
      repoId: `r${i}`,
      position: { x: 150 + i * 420, y: 520 },
    }));
    board.groups = [{ id: 'g', name: '客户端', nodeIds: ['a', 'b'], collapsed: false }];
    board.edges = [
      {
        id: 'ac',
        source: 'a',
        target: 'c',
        kind: 'integration',
        label: '发布依据',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
    ];
  }
  const { token } = await (await request.get('/api/session')).json();
  expect(
    (
      await request.put('/api/workspace', {
        headers: { 'X-MeGit-Token': token },
        data: {
          ...current,
          activeBoardId: 'tools',
          boards: [board, { id: 'other', name: '另一白板', description: '', nodes: [], edges: [] }],
          repositories: paths.map((p, i) => ({
            id: `r${i}`,
            name: ['公共库', '前端', '服务端'][i],
            path: p,
          })),
        },
      })
    ).ok(),
  ).toBe(true);
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
async function select(page: Page, ids: string[]) {
  for (const id of ids)
    await node(page, id).click({ modifiers: ['Control'], position: { x: 65, y: 42 } });
  await expect(page.locator('.selection-count')).toHaveText(`已选 ${ids.length} 项`);
}
async function arrange(page: Page, label: string) {
  await page.getByRole('button', { name: '排列所选节点', exact: true }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('选择、平移、独立锁定与说明历史；原生输入撤销不回退白板', async ({ page, request }) => {
  await seed(request);
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  await expect(page.getByTestId('note-node').first()).toContainText('人工说明');
  await expect(page.getByTestId('note-node').locator('.react-flow__handle')).toHaveCount(0);
  await node(page, 'n1').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
    .toBe(210);
  await expect(node(page, 'n1')).toHaveAttribute('style', /translate\(210px, 180px\)/);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
    .toBe(200);
  await expect(node(page, 'n1')).toHaveAttribute('style', /translate\(200px, 180px\)/);
  await page.getByRole('button', { name: '重做白板编辑', exact: true }).click();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
    .toBe(210);
  await page.getByRole('button', { name: '锁定布局', exact: true }).click();
  await expect(page.getByText('布局已锁定', { exact: true })).toBeVisible();
  await node(page, 'n1').focus();
  await page.keyboard.press('ArrowRight');
  await expect(node(page, 'n1')).toHaveAttribute('style', /translate\(210px, 180px\)/);
  await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '锁定缩放', exact: true }).click();
  const zoom = await page.locator('.canvas-zoom-label').innerText();
  await expect(page.getByRole('button', { name: '放大白板', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '适应白板', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '平移', exact: true }).click();
  const box = (await node(page, 'n1').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 5 });
  await page.mouse.up();
  expect((await readWorkspace(request)).boards[0].notes![0].position.x).toBe(210);
  expect(await page.locator('.canvas-zoom-label').innerText()).toBe(zoom);
  await page.getByRole('button', { name: '解锁缩放', exact: true }).click();
  await page.getByRole('button', { name: '解锁布局', exact: true }).click();
  await page.getByRole('button', { name: '选择', exact: true }).click();
  await page.getByRole('button', { name: '添加说明', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '说明详情' });
  await panel.getByLabel('说明标题').fill('部署说明');
  await panel.getByLabel('说明内容').fill('这是人工维护的发布计划，不代表部署成功。');
  await panel.getByLabel('说明内容').press('End');
  await panel.getByLabel('说明内容').pressSequentially('xyz');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('note-node')).toHaveCount(4);
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '关闭说明详情', exact: true }).click();
  await page
    .locator('.canvas-selection-tools')
    .getByRole('button', { name: '移除所选元素', exact: true })
    .click();
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect(page.getByTestId('note-node').filter({ hasText: '部署说明' })).toBeVisible();
  await page.getByRole('button', { name: '锁定布局', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('布局已锁定', { exact: true })).toBeVisible();
  await expect(page.getByTestId('note-node')).toHaveCount(4);
});

test('多选排列、独立白板历史、聚焦与 SVG / PNG 导出，双主题和窄屏', async ({ page, request }) => {
  await seed(request);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  await select(page, ['n1', 'n2', 'n3']);
  await arrange(page, '顶对齐');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes!.map((n) => n.position.y))
    .toEqual([180, 180, 180]);
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position.y)
    .toBe(300);
  await select(page, ['n1', 'n2', 'n3']);
  await arrange(page, '水平等间距');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position.x)
    .toBe(660);
  await page.getByRole('button', { name: /另一白板/ }).click();
  await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /MeGit 设计/ }).click();
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position.x)
    .toBe(560);
  await select(page, ['n1']);
  await page.getByRole('button', { name: '聚焦所选内容', exact: true }).click();
  await expect(page.getByTestId('note-node')).toHaveCount(1);
  expect((await readWorkspace(request)).boards[0].notes).toHaveLength(3);
  await page.getByRole('button', { name: '适应白板', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.mouse.move(1400, 850);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${evidence}/tools-dark-zh.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '导出白板', exact: true }).click();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
  const svg = await svgDownload;
  await svg.saveAs(`${evidence}/focused.svg`);
  const source = await readFile((await svg.path())!, 'utf8');
  expect(source).toContain('开发计划');
  expect(source).not.toContain('待办清单');
  expect(source).not.toMatch(/foreignObject|react-flow|canvas-tool/);
  expect(
    await page.evaluate(
      (text) =>
        new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror')
          ?.textContent || '',
      source,
    ),
  ).toBe('');
  await page.getByRole('button', { name: '导出白板', exact: true }).click();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  const png = await pngDownload;
  await png.saveAs(`${evidence}/focused.png`);
  expect((await readFile((await png.path())!)).subarray(0, 8).toString('hex')).toBe(
    '89504e470d0a1a0a',
  );
  await page.getByRole('button', { name: '退出聚焦', exact: true }).click();
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences' }).click();
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lock layout', exact: true }).focus();
  await expect(page.getByRole('tooltip', { name: 'Lock layout', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.move(1400, 850);
  await page.screenshot({ path: `${evidence}/tools-light-en.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const actual = await page
        .locator('.react-flow__viewport')
        .evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
      const shown =
        Number((await page.locator('.canvas-zoom-label').innerText()).replace('%', '')) / 100;
      return Math.abs(actual - shown);
    })
    .toBeLessThan(0.01);
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export board', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Export board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${evidence}/tools-mobile-light-en.png`, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('真实框选后直接使用方向键与选择框拖动，布局持久化且可撤销', async ({ page, request }) => {
  await seed(request);
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  const a = (await node(page, 'n1').boundingBox())!;
  const b = (await node(page, 'n2').boundingBox())!;
  await page.mouse.move(a.x - 12, a.y - 12);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 12, b.y + b.height + 12, { steps: 10 });
  await page.mouse.up();
  const selection = page.locator('.react-flow__nodesselection-rect');
  await expect(selection).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes!.map((n) => n.position.x))
    .toEqual([210, 570, 1120]);
  const box = (await selection.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
    .toBeGreaterThan(210);
  const moved = (await readWorkspace(request)).boards[0].notes!;
  expect(moved[1].position.x - moved[0].position.x).toBeCloseTo(360, 8);
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
    .toBe(210);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(node(page, 'n1')).toHaveAttribute('style', /translate\(210px, 180px\)/);
});

test('聚焦中新增说明立即可见，撤销移除且原说明保留', async ({ page, request }) => {
  await seed(request);
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  await expect(page.getByTestId('note-node')).toHaveCount(3);
  await select(page, ['n1']);
  await page.getByRole('button', { name: '聚焦所选内容', exact: true }).click();
  await expect(page.getByTestId('note-node')).toHaveCount(1);
  await page.getByRole('button', { name: '添加说明', exact: true }).click();
  await expect(page.getByTestId('note-node')).toHaveCount(4);
  await expect(page.getByRole('dialog', { name: '说明详情' })).toBeVisible();
  await page.getByRole('button', { name: '关闭说明详情', exact: true }).click();
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect(page.getByTestId('note-node')).toHaveCount(3);
});

test('聚焦过滤后折叠组端口与连线贴合，锁定缩放不影响重测，外部打开退出聚焦', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const paths = [f.repo];
    for (const name of ['frontend', 'service']) {
      const p = path.join(f.root, name);
      await git(f.root, 'clone', f.repo, p);
      paths.push(p);
    }
    await seed(request, paths);
    const workspace = await readWorkspace(request);
    workspace.boards[0].groups = [{ id: 'g', name: '接收组', nodeIds: ['c'], collapsed: true }];
    workspace.boards[0].edges.push({ ...workspace.boards[0].edges[0], id: 'bc', source: 'b' });
    const { token } = await (await request.get('/api/session')).json();
    expect(
      (
        await request.put('/api/workspace', {
          headers: { 'X-MeGit-Token': token },
          data: workspace,
        })
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: 1520, height: 980 });
    await page.goto('/');
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await page.getByRole('button', { name: '查看公共库', exact: true }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '锁定缩放', exact: true }).click();
    const mismatch = async () =>
      page.evaluate(() => {
        const path = document.querySelector<SVGPathElement>('.workflow-edge-path#ac')!;
        const endpoint = path.getPointAtLength(path.getTotalLength());
        const screen = new DOMPoint(endpoint.x, endpoint.y).matrixTransform(path.getScreenCTM()!);
        const handle = document
          .querySelector<HTMLElement>('[data-handleid="target-left:ac"]')!
          .getBoundingClientRect();
        return Math.hypot(screen.x - handle.x, screen.y - handle.y - handle.height / 2);
      });
    await expect.poll(mismatch).toBeLessThan(1);
    await page.getByRole('button', { name: '聚焦所选上下游', exact: true }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect.poll(mismatch).toBeLessThan(1);
    await page.getByRole('button', { name: '退出聚焦', exact: true }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await expect.poll(mismatch).toBeLessThan(1);
    await page.getByRole('button', { name: '聚焦所选上下游', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(1);
    await page
      .locator('#workspace-navigation')
      .getByRole('button', { name: '前端', exact: true })
      .click();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await expect(page.getByRole('complementary', { name: '前端 仓库详情' })).toBeVisible();
    expect((await readWorkspace(request)).boards[0].groups![0].collapsed).toBe(true);
    await page.getByRole('button', { name: '聚焦所选内容', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(1);
    const added = path.join(f.root, 'added');
    await git(f.root, 'clone', f.repo, added);
    await page.getByRole('button', { name: '添加仓库', exact: true }).click();
    await page.getByLabel('仓库路径').fill(added);
    await page.getByLabel('卡片显示名称').fill('新加入的仓库');
    await page.getByRole('button', { name: '添加到白板', exact: true }).click();
    await expect(
      page.getByTestId('repository-node').filter({ hasText: '新加入的仓库' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '退出聚焦', exact: true })).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('所选仓库直接分组且正确恢复成员；说明草稿在移动和保存期间保留', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const paths = [f.repo];
    for (const name of ['frontend', 'service']) {
      const p = path.join(f.root, name);
      await git(f.root, 'clone', f.repo, p);
      paths.push(p);
    }
    await seed(request, paths);
    await page.setViewportSize({ width: 1700, height: 1100 });
    await page.goto('/');
    await expect(page.getByTestId('repository-node')).toHaveCount(3);
    await select(page, ['b', 'c']);
    await page.getByRole('button', { name: '将所选仓库分组', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建仓库分组' });
    await expect(dialog.getByRole('checkbox', { name: '前端', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '服务端', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '公共库', exact: true })).not.toBeChecked();
    await dialog.getByLabel('分组名称').fill('服务团队');
    await dialog.getByRole('button', { name: '保存分组', exact: true }).click();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].groups!.map((g) => g.nodeIds))
      .toEqual([['a'], ['b', 'c']]);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].groups!.map((g) => g.nodeIds))
      .toEqual([['a', 'b']]);
    await node(page, 'n1').getByRole('button', { name: '说明详情', exact: true }).click();
    const panel = page.getByRole('dialog', { name: '说明详情' });
    await panel.getByLabel('说明内容').fill('尚未保存的草稿');
    await panel.getByRole('button', { name: '保存', exact: true }).click();
    await panel.getByRole('button', { name: '关闭说明详情', exact: true }).click();
    await node(page, 'n1').focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].notes![0].position.x)
      .toBe(210);
    await node(page, 'n1').getByRole('button', { name: '说明详情', exact: true }).click();
    await expect(panel.getByLabel('说明内容')).toHaveValue('尚未保存的草稿');
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].notes![0].text)
      .toBe('尚未保存的草稿');
  } finally {
    await f.cleanup();
  }
});

test('组与成员混合多选共同移动，上下游聚焦；撤销白板不改变真实 Git 提交', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const paths = [f.repo];
    for (const name of ['frontend', 'service']) {
      const p = path.join(f.root, name);
      await git(f.root, 'clone', f.repo, p);
      paths.push(p);
    }
    await seed(request, paths);
    await page.setViewportSize({ width: 1700, height: 1100 });
    await page.goto('/');
    await expect(page.getByTestId('repository-node')).toHaveCount(3);
    await select(page, ['g', 'a', 'n1']);
    await node(page, 'g').focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].nodes.map((n) => n.position.x))
      .toEqual([160, 580, 990]);
    expect((await readWorkspace(request)).boards[0].notes![0].position.x).toBe(210);
    const groupBox = (await node(page, 'g').locator('.group-heading').boundingBox())!;
    await page.mouse.move(groupBox.x + 65, groupBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + 120, groupBox.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].nodes[0].position.x)
      .toBeGreaterThan(160);
    const moved = (await readWorkspace(request)).boards[0];
    expect(moved.nodes[1].position.x - moved.nodes[0].position.x).toBeCloseTo(420, 8);
    expect(moved.notes![0].position.x - moved.nodes[0].position.x).toBeCloseTo(50, 8);
    await page.getByRole('button', { name: '查看公共库', exact: true }).click();
    await page.getByRole('button', { name: '聚焦所选上下游', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await expect(page.getByTestId('note-node')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: '导出白板', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
    const file = await download;
    await file.saveAs(`${evidence}/upstream.svg`);
    const svg = await readFile((await file.path())!, 'utf8');
    expect(svg).toContain('发布依据');
    expect(svg).toContain('公共库');
    expect(svg).not.toContain(f.repo);
    expect(svg).not.toContain('待办清单');
    await page.getByRole('button', { name: '退出聚焦', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(3);
    await page.getByRole('button', { name: '查看公共库', exact: true }).click();
    await writeFile(path.join(f.repo, 'board-history.txt'), 'A real commit\n');
    await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
    await openRepositoryTools(page, 'worktree');
    await page.getByRole('button', { name: '暂存 board-history.txt', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('提交说明', { exact: true })
      .fill('白板历史不撤销这个提交');
    await page.getByRole('button', { name: '提交 1 个文件', exact: true }).click();
    await expect(page.getByText('公共库：提交已保存到本地仓库', { exact: true })).toBeVisible();
    const head = await git(f.repo, 'rev-parse', 'HEAD');
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].nodes[0].position.x)
      .toBe(160);
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    await page.getByRole('button', { name: '重做白板编辑', exact: true }).click();
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].nodes[0].position.x)
      .toBe(moved.nodes[0].position.x);
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect((await readWorkspace(request)).repositories.map((r) => r.path)).toHaveLength(3);
  } finally {
    await f.cleanup();
  }
});
