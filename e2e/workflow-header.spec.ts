import { test, expect } from './test';
import { fixture, commitFile } from '../tests/fixtures';
import type { APIRequestContext } from '@playwright/test';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'source', name: '示例仓库', path: repo }];
  workspace.boards = [
    {
      id: 'workflow',
      name: '发布工作流',
      description: '审核通过后发布。',
      viewport: { x: 20, y: 30, zoom: 0.8 },
      nodes: [{ id: 'node', repoId: 'source', position: { x: 100, y: 160 } }],
      edges: [],
    },
    { id: 'other', name: '另一工作流', description: '', nodes: [], edges: [] },
  ];
  workspace.activeBoardId = 'workflow';
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  return { headers, read: () => request.get('/api/workspace', { headers }).then((r) => r.json()) };
}

test('工作流标题栏与详情等高，信息和关闭重开不改写白板或关闭右侧详情', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const store = await seed(request, f.repo);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const heading = page.locator('.workflow-panel > .inspector-heading');
    await expect(heading.getByRole('heading', { name: '发布工作流', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看示例仓库', exact: true }).click();
    const repository = page.locator('.dock-card .inspector-heading');
    expect((await heading.boundingBox())!.height).toBe((await repository.boundingBox())!.height);
    expect((await heading.boundingBox())!.y).toBe((await repository.boundingBox())!.y);
    expect((await heading.boundingBox())!.height).toBe(29);
    const viewport = page.locator('.react-flow__viewport');
    const transform = await viewport.getAttribute('style');
    const saved = await store.read();
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) writes++;
    });
    const info = heading.getByRole('button', { name: '工作流信息', exact: true });
    await info.click();
    const popup = page.getByRole('dialog', { name: '工作流信息', exact: true });
    await expect(popup).toContainText('审核通过后发布。');
    await expect(popup).toContainText('1 个仓库');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(info).toBeFocused();
    await heading.getByRole('button', { name: '关闭工作流面板', exact: true }).click();
    await expect(heading).toBeHidden();
    await expect(repository).toBeVisible();
    const reopen = page.getByRole('button', { name: '重新打开工作流', exact: true });
    await expect(reopen).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading).toBeVisible();
    await expect(viewport).toHaveAttribute('style', transform!);
    await heading.getByRole('button', { name: '关闭工作流面板', exact: true }).click();
    await page
      .locator('#workspace-navigation .board-item')
      .filter({ hasText: '发布工作流' })
      .click();
    await expect(heading).toBeVisible();
    await expect(repository).toBeVisible();
    await expect(viewport).toHaveAttribute('style', transform!);
    expect(writes).toBe(0);
    expect(await store.read()).toEqual(saved);
    await page.screenshot({ path: '.megit/verification/workflow-header/dark-zh.png' });
  } finally {
    await f.cleanup();
  }
});

test('关闭工作流后仍可打开导航、切换工作流，刷新保留关闭状态', async ({ page, request }) => {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.boards.push({
    id: 'another',
    name: '另一工作流',
    description: '',
    nodes: [],
    edges: [],
  });
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  await page.goto('/');
  const heading = page.locator('.workflow-panel > .inspector-heading');
  await heading.getByRole('button', { name: '关闭工作流面板', exact: true }).click();
  await expect(heading).toBeHidden();
  await page.getByRole('button', { name: '收起流程导航', exact: true }).click();
  await page.getByRole('button', { name: '我的工作流', exact: true }).click();
  await page
    .getByRole('dialog', { name: '我的工作流', exact: true })
    .getByRole('button', { name: '另一工作流', exact: false })
    .click();
  await expect(heading).toBeVisible();
  await expect(heading.getByRole('heading', { name: '另一工作流', exact: true })).toBeVisible();
  await heading.getByRole('button', { name: '关闭工作流面板', exact: true }).click();
  await page.reload();
  await expect(heading).toBeHidden();
  await expect(page.getByRole('button', { name: '重新打开工作流', exact: true })).toBeVisible();
});

test('明亮英文长工作流名与390px触控标题栏可读，信息和关闭入口可用', async ({
  browser,
  request,
}) => {
  const f = await fixture();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    await seed(request, f.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    const name = 'workflow/' + 'parallel-development-'.repeat(4);
    workspace.boards[0].name = name;
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await context.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({
          version: 1,
          theme: 'light',
          language: 'en',
          navigationCollapsed: true,
        }),
      ),
    );
    const page = await context.newPage();
    await page.goto('/');
    const heading = page.locator('.workflow-panel > .inspector-heading');
    await expect(heading.getByRole('heading', { name, exact: true })).toBeVisible();
    expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const sizes = await heading.getByRole('button').evaluateAll((elements) =>
      elements.map((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    );
    expect(sizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
    await heading.getByRole('button', { name: 'Workflow information', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Workflow information', exact: true }),
    ).toContainText(name);
    await page.screenshot({ path: '.megit/verification/workflow-header/light-en-touch-info.png' });
    await page.keyboard.press('Escape');
    await heading.getByRole('button', { name: 'Close workflow panel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen workflow', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Reopen workflow', exact: true }).click();
    await expect(heading).toBeVisible();
  } finally {
    await context.close();
    await f.cleanup();
  }
});
