import { openRepositoryTools } from './branch-tree-helpers';
import { test, expect } from './test';
import type { APIRequestContext } from '@playwright/test';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

async function seed(request: APIRequestContext, repo: string, second?: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const { path } = await (
    await request.post('/api/repositories/inspect', { headers, data: { path: repo } })
  ).json();
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'repo', name: '公共库', path }];
  if (second) workspace.repositories.push({ id: 'second', name: '应用库', path: second });
  workspace.boards = [
    {
      id: 'dock',
      name: '详情对照',
      description: '',
      viewport: { x: 15, y: 20, zoom: 0.7 },
      nodes: [
        { id: 'r', repoId: 'repo', position: { x: 80, y: 100 } },
        ...(second ? [{ id: 'r2', repoId: 'second', position: { x: 600, y: 100 } }] : []),
      ],
      edges: second
        ? [
            {
              id: 'link',
              source: 'r',
              target: 'r2',
              kind: 'dependency',
              label: '依赖关系',
              sourceRef: 'HEAD',
              targetRef: 'HEAD',
            },
          ]
        : [],
      notes: [{ id: 'note', title: '开发笔记', text: '已保存正文', position: { x: 100, y: 420 } }],
      groups: [{ id: 'group', name: '客户端', nodeIds: ['r'], collapsed: false }],
    },
    { id: 'other', name: '另一流程', description: '', nodes: [], edges: [] },
  ];
  workspace.activeBoardId = 'dock';
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

test('Git 详情直接并排显示，不包含全局导航、标签或白板操作底栏', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, '第二仓库');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await page.getByRole('button', { name: '应用库', exact: true }).click();
    await page.locator('[data-edge-id="link"]').click();
    const dock = page.getByRole('region', { name: '详情浏览区域', exact: true });
    await expect(dock.locator('.dock-card')).toHaveCount(3);
    await expect(dock.locator('.dock-header, .dock-tabs, .inspector-footer')).toHaveCount(0, {
      timeout: 1000,
    });
    await expect(dock.getByRole('button', { name: '从白板移除', exact: true })).toHaveCount(0);
    await expect(dock.getByRole('button', { name: '移除关系', exact: true })).toHaveCount(0);
    await expect(dock.getByLabel('连线样式', { exact: true })).toHaveCount(0);
    await expect(dock.getByRole('button', { name: '编辑关系', exact: true })).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('两套主题的左右面板同色，且与白板底色不同', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const canvas = page.locator('.canvas-shell');
    const dock = page.getByRole('region', { name: '详情浏览区域', exact: true });
    const panel = dock.getByRole('complementary', { name: '公共库 仓库详情', exact: true });
    const stage = panel.locator('.branch-tree-stage');
    const map = stage.locator('.branch-tree-viewport');
    const navigation = page.locator('#workspace-navigation');
    const matchingSurfaces = [
      dock,
      page.locator('.workflow-panel > .workflow-header'),
      panel.locator(':scope > .inspector-heading'),
      page.locator('.workspace-statusbar'),
    ];
    const expectMatchingSurfaces = async () => {
      const background = await navigation.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      for (const surface of matchingSurfaces) {
        await expect(surface).toBeVisible();
        await expect(surface).toHaveCSS('background-color', background);
      }
      await expect(canvas).not.toHaveCSS('background-color', background);
    };
    await expect(canvas).toBeVisible();
    await expect(map).toBeVisible();
    await expectMatchingSurfaces();
    await expect(stage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(map).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(canvas).toHaveCSS('background-color', 'rgb(0, 13, 31)');
    await expect(panel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(dock).toHaveCSS('border-left-width', '0px');
    await page.screenshot({ path: '.megit/verification/inspector-surface-dark.png' });

    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByRole('button', { name: '关闭偏好设置', exact: true }).click();
    await expectMatchingSurfaces();
    await expect(canvas).toHaveCSS('background-color', 'rgb(217, 225, 235)');
    await expect(map).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(dock).toHaveCSS('border-left-width', '0px');
    await page.screenshot({ path: '.megit/verification/inspector-surface-light.png' });
  } finally {
    await f.cleanup();
  }
});

test('白板和说明编辑由画布打开弹窗，不占用 Git 详情区域', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await page.getByRole('button', { name: '白板详情', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '白板详情', exact: true });
    await expect(editor).toBeVisible({ timeout: 1000 });
    await expect(page.locator('.dock-card')).toHaveCount(1);
    await editor.getByLabel('流程说明').fill('白板编辑保留在画布弹窗');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await editor.getByRole('button', { name: '关闭白板详情', exact: true }).click();
    await page.getByTestId('note-node').getByRole('button', { name: '说明详情' }).click();
    await expect(page.getByRole('dialog', { name: '说明详情', exact: true })).toBeVisible();
    await expect(page.locator('.dock-card')).toHaveCount(1);
  } finally {
    await f.cleanup();
  }
});

test('移除按钮位于选中副工具栏，批量移除及关系移除均可一步撤销', async ({ page, request }) => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    const second = path.join(f.root, '应用');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const remove = page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '移除所选元素', exact: true });
    await expect(remove).toBeVisible({ timeout: 1000 });
    await expect(remove).toHaveClass(/danger/);
    await remove.click();
    await expect(page.locator('.react-flow__node[data-id="r"]')).toHaveCount(0);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="r"]')).toBeVisible();
    await page.locator('[data-edge-id="link"]').click();
    await expect(page.locator('.selection-count')).toHaveText('已选 1 项');
    await remove.click();
    await expect(page.locator('[data-edge-id="link"]')).toHaveCount(0);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect(page.locator('[data-edge-id="link"]')).toBeVisible();
    await page
      .locator('.react-flow__node[data-id="r"]')
      .click({ position: { x: 70, y: 45 }, modifiers: ['Control'] });
    await page
      .locator('.react-flow__node[data-id="note"]')
      .click({ position: { x: 70, y: 75 }, modifiers: ['Control'] });
    await expect(page.locator('.selection-count')).toHaveText('已选 2 项');
    await remove.click();
    await expect(
      page.locator('.react-flow__node[data-id="r"], .react-flow__node[data-id="note"]'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect(
      page.locator('.react-flow__node[data-id="r"], .react-flow__node[data-id="note"]'),
    ).toHaveCount(2);
    await expect(page.locator('[data-edge-id="link"]')).toBeVisible();
    await page.locator('.react-flow__node[data-id="group"]').click({ position: { x: 70, y: 20 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await remove.click();
    await expect(page.locator('.react-flow__node[data-id="group"]')).toHaveCount(0);
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect(page.locator('.react-flow__node[data-id="group"]')).toBeVisible();
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
  } finally {
    await f.cleanup();
  }
});

test('重复打开定位已有 Git 详情，空白选择与白板弹窗保留仓库内页', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, '应用');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const repo = page.getByRole('complementary', { name: '公共库 仓库详情', exact: true });
    await repo.getByRole('button', { name: '查看分支 main', exact: true }).click();
    await page.getByRole('button', { name: '应用库', exact: true }).click();
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await expect(page.locator('.dock-card')).toHaveCount(2);
    await expect(repo.getByRole('button', { name: '查看分支 main', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('.react-flow__pane').click({ position: { x: 250, y: 700 } });
    await expect(page.locator('.dock-card')).toHaveCount(2);
    await page.getByRole('button', { name: '白板详情', exact: true }).click();
    await page.getByRole('button', { name: '关闭白板详情', exact: true }).click();
    await expect(repo.getByRole('button', { name: '查看分支 main', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await repo.getByRole('button', { name: '关闭仓库详情', exact: true }).click();
    await expect(page.locator('.dock-card')).toHaveCount(1);
    await expect(
      page
        .getByRole('complementary', { name: '应用库 仓库详情', exact: true })
        .getByRole('button', { name: '关闭仓库详情', exact: true }),
    ).toBeFocused();
  } finally {
    await f.cleanup();
  }
});

test('长仓库名在列标题完整换行并保留关闭入口', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    const title = 'MeGit ' + '研发计划与评审'.repeat(12);
    workspace.repositories[0].name = title;
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page
      .locator('#workspace-navigation')
      .getByRole('button', { name: title, exact: true })
      .click();
    const heading = page.locator('.dock-card .inspector-heading');
    await expect(heading.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(
      heading.getByRole('button', { name: '关闭仓库详情', exact: true }),
    ).toBeInViewport();
    const metrics = await heading.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    await page.screenshot({
      path: '.megit/verification/git-inspector/long-title.png',
      animations: 'disabled',
    });
  } finally {
    await f.cleanup();
  }
});

test('两个仓库各自关联提交字段并保留独立草稿', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, '应用 repo');
    await git(f.root, 'clone', f.repo, second);
    for (const repo of [f.repo, second]) {
      await writeFile(path.join(repo, 'staged.txt'), '仅用于独立字段验证\n');
      await git(repo, 'add', '--', 'staged.txt');
    }
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const first = page.getByRole('complementary', { name: '公共库 仓库详情', exact: true });
    await openRepositoryTools(page, 'worktree', first);
    await first.getByLabel('提交说明', { exact: true }).fill('公共库的草稿');
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.getByRole('button', { name: '应用库', exact: true }).click();
    const other = page.getByRole('complementary', { name: '应用库 仓库详情', exact: true });
    await openRepositoryTools(page, 'worktree', other);
    await expect(other.locator('textarea')).toHaveValue('');
    // Every label must resolve to the control in its own repository panel.
    expect(
      await other
        .getByLabel('提交说明', { exact: true })
        .evaluate((el) => el.closest('aside')?.getAttribute('aria-label')),
    ).toBe('应用库 仓库详情');
    await other.getByLabel('提交说明', { exact: true }).fill('应用库的草稿');
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await openRepositoryTools(page, 'worktree', first);
    await expect(first.getByLabel('提交说明', { exact: true })).toHaveValue('公共库的草稿');
    const firstId = await first.getByLabel('提交说明', { exact: true }).getAttribute('id');
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.getByRole('button', { name: '应用库', exact: true }).click();
    await openRepositoryTools(page, 'worktree', other);
    await expect(other.getByLabel('提交说明', { exact: true })).toHaveValue('应用库的草稿');
    expect(await other.getByLabel('提交说明', { exact: true }).getAttribute('id')).not.toBe(
      firstId,
    );
  } finally {
    await f.cleanup();
  }
});

test('拖拽和键盘调宽遵守窗口 2/3 上限，宽度记忆且画布视角不变', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const dock = page.getByRole('region', { name: '详情浏览区域', exact: true });
    const handle = page.getByRole('separator', { name: '调整详情区域宽度', exact: true });
    const indicator = handle.locator('span');
    await expect(page.locator('.save-state')).toHaveText('已保存');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const before = await (await request.get('/api/workspace', { headers })).json();
    const transform = await page.locator('.react-flow__viewport').getAttribute('style');
    const box = (await handle.boundingBox())!;
    await expect(indicator).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(indicator).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    await page.mouse.down();
    await page.mouse.move(10, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    expect((await dock.boundingBox())!.width).toBeCloseTo(1000, 0);
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
    await handle.focus();
    await page.keyboard.press('Home');
    expect((await dock.boundingBox())!.width).toBeCloseTo(320, 0);
    await page.keyboard.press('ArrowLeft');
    expect((await dock.boundingBox())!.width).toBeCloseTo(336, 0);
    await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
    expect(await (await request.get('/api/workspace', { headers })).json()).toEqual(before);
    await page.reload();
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    expect((await dock.boundingBox())!.width).toBeCloseTo(336, 0);
    await handle.focus();
    await page.keyboard.press('End');
    await page.setViewportSize({ width: 900, height: 900 });
    expect((await dock.boundingBox())!.width).toBeLessThanOrEqual(601);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await f.cleanup();
  }
});

test('关系比较独立滚动，关闭后焦点恢复相邻列，切换白板清空旧 Git 详情', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, '目标');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1600, height: 560 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await page.locator('[data-edge-id="link"]').click();
    const relation = page.getByRole('complementary', { name: '流程关系详情', exact: true });
    expect(
      await relation
        .locator('.relation-panel-body')
        .evaluate((el) => getComputedStyle(el).overflowY),
    ).toBe('auto');
    await relation.getByRole('button', { name: '关闭关系详情', exact: true }).click();
    await expect(page.locator('.dock-card')).toHaveCount(1);
    await expect(
      page
        .getByRole('complementary', { name: '公共库 仓库详情', exact: true })
        .getByRole('button', { name: '关闭仓库详情', exact: true }),
    ).toBeFocused();
    await page
      .locator('.board-list')
      .getByRole('button', { name: '另一流程 0', exact: true })
      .click();
    await expect(page.locator('.inspector-dock')).toHaveCount(0);
    await page
      .locator('.board-list')
      .getByRole('button', { name: '详情对照 2', exact: true })
      .click();
    await expect(page.locator('.inspector-dock')).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('添加仓库直接打开新详情，同时保留原仓库内页', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    const second = path.join(f.root, '新仓库');
    await git(f.root, 'clone', f.repo, second);
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    const original = page.getByRole('complementary', { name: '公共库 仓库详情', exact: true });
    await original.getByRole('button', { name: '查看分支 main', exact: true }).click();
    await page.getByRole('button', { name: '添加仓库', exact: true }).click();
    await page.getByLabel('仓库路径').fill(second);
    await page.getByLabel('卡片显示名称').fill('新增仓库');
    await page.getByRole('button', { name: '添加到白板', exact: true }).click();
    await expect(page.locator('.dock-card')).toHaveCount(2);
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await expect(
      original.getByRole('button', { name: '查看分支 main', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await f.cleanup();
  }
});

test('区域无标签仍可平滑横向浏览，双主题与英文窄屏保留关闭和调宽', async ({ page, request }) => {
  const f = await fixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, '应用');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await page.getByRole('button', { name: '应用库', exact: true }).click();
    await page.locator('[data-edge-id="link"]').click();
    const scroller = page.getByLabel('详情内容', { exact: true });
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '公共库', exact: true }).click();
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeLessThan(2);
    await scroller.hover({ position: { x: 20, y: 12 } });
    await page.mouse.wheel(350, 0);
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await page.getByRole('separator', { name: '调整详情区域宽度', exact: true }).focus();
    await page.keyboard.press('End');
    await expect.poll(() => scroller.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.mouse.move(100, 800);
    await page.keyboard.press('Escape');
    await page.screenshot({
      path: '.megit/verification/git-inspector/dark-zh.png',
      animations: 'disabled',
    });
    const removal = page
      .locator('.canvas-selection-tools')
      .getByRole('button', { name: '移除所选元素', exact: true });
    await expect(removal).toHaveClass(/danger/);
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await page.screenshot({
      path: '.megit/verification/git-inspector/light-en.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (await page.getByRole('region', { name: 'Details browser', exact: true }).boundingBox())!
        .width,
    ).toBeLessThanOrEqual(260);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: '.megit/verification/git-inspector/light-en-mobile.png',
      animations: 'disabled',
    });
    for (let remaining = 3; remaining > 0; remaining--) {
      await page.locator('.dock-card [data-panel-close]').first().focus();
      await page.mouse.move(40, 700);
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('.inspector-dock')).toHaveCount(0);
    await expect(page.locator('[data-details-trigger]')).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
