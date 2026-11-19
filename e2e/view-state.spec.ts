import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { APIRequestContext } from '@playwright/test';
import { selectBranch, openRepositoryTools } from './branch-tree-helpers';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

async function seed(request: APIRequestContext, first: string, second: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [
    { id: 'first', name: '浏览甲', path: first },
    { id: 'second', name: '浏览乙', path: second },
  ];
  workspace.boards = [
    {
      id: 'restore',
      name: '连续浏览',
      description: '',
      viewport: { x: 0, y: 0, zoom: 0.7 },
      nodes: [
        { id: 'a', repoId: 'first', position: { x: 60, y: 120 } },
        { id: 'b', repoId: 'second', position: { x: 530, y: 120 } },
      ],
      edges: [],
    },
  ];
  workspace.activeBoardId = 'restore';
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

test('刷新恢复打开的详情、地图视角、横向位置及白板关闭状态', async ({ page, request }) => {
  const f = await fixture();
  try {
    for (let i = 0; i < 10; i++) await commitFile(f.repo, `version-${i}.txt`);
    await git(f.repo, 'branch', 'feature/search');
    const second = path.join(f.root, 'second');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.setViewportSize({ width: 1440, height: 450 });
    await page.goto('/');
    await page.getByRole('button', { name: '浏览甲', exact: true }).click();
    await page.getByRole('button', { name: '浏览乙', exact: true }).click();
    await page.getByRole('button', { name: '浏览甲', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '浏览甲 仓库详情', exact: true });
    await selectBranch(panel, 'feature/search');
    await panel.getByRole('button', { name: '图上比较', exact: true }).click();
    await expect(panel.locator('.branch-tree-comparison strong')).toBeVisible();
    await panel.getByRole('button', { name: '分支树工具', exact: true }).click();
    await panel.getByRole('button', { name: '展开连续提交', exact: true }).click();
    await panel.getByRole('button', { name: '放大分支树', exact: true }).click();
    const map = panel.locator('.branch-tree-viewport');
    await map.evaluate((el) => {
      el.scrollTo({ top: 180, left: 0, behavior: 'instant' });
    });
    await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBe(180);
    const detail = panel.locator('.branch-tree-selection-body');
    await detail.evaluate((el) => el.scrollTo({ top: 40, behavior: 'instant' }));
    await expect.poll(() => detail.evaluate((el) => el.scrollTop)).toBe(40);
    const dock = page.locator('.dock-panels');
    await dock.evaluate((el) => el.scrollTo({ left: 110, behavior: 'instant' }));
    await expect.poll(() => dock.evaluate((el) => el.scrollLeft)).toBe(110);
    await page.getByRole('button', { name: '关闭工作流面板', exact: true }).click();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/actions')) writes.push(request.method());
    });
    await page.reload();
    await expect(page.locator('.dock-card')).toHaveCount(2);
    await expect(page.locator('.dock-card').first()).toHaveAttribute(
      'data-key',
      'repository:a',
    );
    await expect(panel.getByRole('region', { name: '分支详情', exact: true })).toContainText(
      'feature/search',
    );
    await expect(panel.locator('.branch-tree-drawing')).toHaveCSS('transform', /matrix\(1\.1,/);
    await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBe(180);
    await expect.poll(() => detail.evaluate((el) => el.scrollTop)).toBe(40);
    await expect.poll(() => dock.evaluate((el) => el.scrollLeft)).toBe(110);
    await expect(page.getByRole('button', { name: '重新打开工作流', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test('课堂窗口的拖动位置刷新保留，在更小窗口内恢复可见', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: '使用帮助', exact: true }).click();
  await page.getByRole('button', { name: '学习 Git', exact: true }).click();
  const learning = page.locator('.git-learning-dialog');
  const handle = learning.getByRole('button', { name: /^移动窗口/ });
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(learning).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 40, 40)');
  await page.reload();
  await expect(learning).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 40, 40)');
  await page.setViewportSize({ width: 390, height: 600 });
  await page.reload();
  await expect(
    learning.getByRole('button', { name: '关闭 Git 图解课堂', exact: true }),
  ).toBeInViewport();
  const box = (await learning.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(7);
  expect(box.y).toBeGreaterThanOrEqual(7);
  expect(box.x + box.width).toBeLessThanOrEqual(383);
});

test('关系详情的展开依据和阅读位置刷新后恢复', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, 'second');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.boards[0].edges.push({
      id: 'integration',
      source: 'a',
      target: 'b',
      kind: 'integration',
      label: '版本整合',
      sourceRef: 'HEAD',
      targetRef: 'HEAD',
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 270 });
    await page.goto('/');
    await page.locator('[data-edge-id="integration"]').click();
    const relation = page.locator('.relation-inspector');
    await relation.locator('summary').click();
    await expect(relation.locator('.integration-history-wires')).toBeVisible();
    const body = relation.locator('.relation-panel-body');
    await body.evaluate((el) => el.scrollTo({ top: 60, behavior: 'instant' }));
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(60);
    await page.reload();
    await expect(relation.locator('details')).toHaveAttribute('open');
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(60);
  } finally {
    await f.cleanup();
  }
});

test('工作区草稿、历史位置和差异窗口刷新后恢复，关闭的详情不复活', async ({ page, request }) => {
  const f = await fixture();
  try {
    for (let i = 0; i < 12; i++) await commitFile(f.repo, `history-${i}.txt`, 'line\n'.repeat(100));
    const second = path.join(f.root, 'second');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await writeFile(path.join(f.repo, 'draft.txt'), 'pending\n');
    await git(f.repo, 'add', '--', 'draft.txt');
    await page.goto('/');
    await page.getByRole('button', { name: '浏览甲', exact: true }).click();
    await openRepositoryTools(page, 'worktree');
    await page
      .getByRole('dialog')
      .getByLabel('提交说明', { exact: true })
      .fill('继续开发分支功能\n保留这个草稿');
    await page.reload();
    await expect(page.getByRole('dialog', { name: '工作区', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('提交说明', { exact: true })).toHaveValue(
      '继续开发分支功能\n保留这个草稿',
    );
    const history = await openRepositoryTools(page, 'history');
    await expect(history.locator('.commit-row')).toHaveCount(12);
    await history.evaluate((el) => el.scrollTo({ top: 180, behavior: 'instant' }));
    await expect.poll(() => history.evaluate((el) => el.scrollTop)).toBe(180);
    await page.reload();
    await expect(history).toBeVisible();
    await expect.poll(() => history.evaluate((el) => el.scrollTop)).toBe(180);
    await history.locator('.commit-row').first().click();
    const diff = page.getByRole('dialog', { name: '差异', exact: true });
    await expect(diff.locator('.diff-view')).toBeVisible();
    await diff
      .locator('.diff-view')
      .evaluate((el) => el.scrollTo({ top: 130, behavior: 'instant' }));
    await expect.poll(() => diff.locator('.diff-view').evaluate((el) => el.scrollTop)).toBe(130);
    await page.reload();
    await expect(diff).toBeVisible();
    await expect.poll(() => diff.locator('.diff-view').evaluate((el) => el.scrollTop)).toBe(130);
    await diff.getByRole('button', { name: /^关闭/ }).click();
    await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await page.getByRole('button', { name: '关闭仓库详情', exact: true }).click();
    await page.reload();
    await expect(page.locator('.dock-card')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('每个浏览器标签独立恢复，已删除仓库与分支不再复活', async ({ page, request, context }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'branch', 'feature/old');
    const second = path.join(f.root, 'second');
    await git(f.root, 'clone', f.repo, second);
    await seed(request, f.repo, second);
    await page.goto('/');
    await page.getByRole('button', { name: '浏览甲', exact: true }).click();
    await selectBranch(page, 'feature/old');
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.locator('.dock-card')).toHaveCount(0);
    await other.getByRole('button', { name: '浏览乙', exact: true }).click();
    await git(f.repo, 'branch', '-d', 'feature/old');
    await page.reload();
    await expect(page.locator('.dock-card')).toHaveCount(1);
    await expect(page.getByRole('region', { name: '分支详情', exact: true })).toHaveCount(0);
    await expect(other.locator('.dock-card')).toHaveAttribute('data-key', 'repository:b');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.boards[0].nodes = workspace.boards[0].nodes.filter(
      (node: { id: string }) => node.id !== 'a',
    );
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.dock-card')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem('megit.view-state')!).entries.find(
              ([key]: [string]) => key === 'app.repository',
            )?.[1],
        ),
      )
      .toBeNull();
    await other.close();
  } finally {
    await f.cleanup();
  }
});

test('明亮英文窄屏恢复帮助滚动和课堂课程、步骤、图形位置', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
    ),
  );
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workflow navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'About MeGit', exact: true });
  await help.evaluate((el) => el.scrollTo({ top: 150, behavior: 'instant' }));
  await expect.poll(() => help.evaluate((el) => el.scrollTop)).toBe(150);
  await page.reload();
  await expect.poll(() => help.evaluate((el) => el.scrollTop)).toBe(150);
  await help.getByRole('button', { name: 'Learn Git', exact: true }).click();
  const learning = page.locator('.git-learning-dialog');
  await learning.locator('.learning-course').nth(2).click();
  await learning.locator('.learning-progress button').nth(2).click();
  await learning
    .locator('.learning-courses')
    .evaluate((el) => el.scrollTo({ left: 150, behavior: 'instant' }));
  const diagram = learning.locator('.learning-diagram-scroll');
  await diagram.evaluate((el) => el.scrollTo({ top: 50, behavior: 'instant' }));
  await expect.poll(() => diagram.evaluate((el) => el.scrollTop)).toBe(50);
  await page.reload();
  await expect(learning.locator('.learning-layout')).toHaveAttribute('data-lesson', 'branches');
  await expect(learning.locator('.learning-layout')).toHaveAttribute('data-step', '2');
  await expect(learning.locator('.learning-layout')).toHaveAttribute('data-playing', 'false');
  await expect
    .poll(() => learning.locator('.learning-courses').evaluate((el) => el.scrollLeft))
    .toBe(150);
  await expect.poll(() => diagram.evaluate((el) => el.scrollTop)).toBe(50);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.screenshot({ path: '.megit/verification/view-state/light-en-mobile.png' });
});

test('新建操作弹窗仍可打开，刷新不重开操作表单且损坏记录有提示', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/actions')) writes.push(request.method());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加仓库', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '添加本地仓库', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.addInitScript(() => sessionStorage.setItem('megit.view-state', 'broken'));
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: '已忽略无法读取的界面记录' }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
