import type { APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { Workspace } from '../shared/types';

async function seed(request: APIRequestContext, repo: string, second: string, count = 2) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const read = () =>
    request.get('/api/workspace', { headers }).then((res) => res.json() as Promise<Workspace>);
  const workspace = await read();
  workspace.repositories = [
    { id: 'core', name: 'MeGit Core', path: repo },
    { id: 'desktop', name: 'MeGit Desktop', path: second },
  ];
  workspace.boards = Array.from({ length: count }, (_, index) => ({
    id: `workflow-${index}`,
    name: index === 0 ? '当前开发' : `review-${index}/a-long-workflow-name-for-design-review`,
    description: '',
    nodes:
      index === 0
        ? [
            { id: 'node-core', repoId: 'core', position: { x: 100, y: 180 } },
            { id: 'node-desktop', repoId: 'desktop', position: { x: 450, y: 180 } },
          ]
        : [],
    edges: [],
    groups:
      index === 0
        ? [{ id: 'clients', name: '客户端', nodeIds: ['node-core'], collapsed: false }]
        : [],
  }));
  workspace.activeBoardId = workspace.boards[0].id;
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  return { read, workspace };
}

test('折叠栏保留列表入口，选择工作流或仓库后保持折叠并展示真实内容', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const second = path.join(f.root, 'desktop');
    await git(f.root, 'clone', f.repo, second);
    const store = await seed(request, f.repo, second);
    await page.goto('/');
    await page.getByRole('button', { name: '收起工作流导航', exact: true }).click();
    const navigation = page.locator('#workspace-navigation');
    const workflows = navigation.getByRole('button', { name: '我的工作流', exact: true });
    const repositories = navigation.getByRole('button', { name: '工作流中的仓库', exact: true });
    await expect(workflows).toBeVisible();
    await expect(repositories).toBeVisible();
    await workflows.click();
    const list = page.getByRole('dialog', { name: '我的工作流', exact: true });
    await expect(list.locator('.board-item')).toHaveCount(2);
    await expect(list.locator('.board-item[aria-current]')).toContainText('当前开发');
    const box = (await list.boundingBox())!;
    const rail = (await navigation.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    await page.screenshot({
      path: '.megit/verification/navigation-flyouts/workflows-dark.png',
      animations: 'disabled',
    });
    await list.getByRole('button', { name: /review-1\// }).click();
    await expect(list).toHaveCount(0);
    await expect(navigation).toHaveAttribute('data-collapsed', 'true');
    await expect(page.getByRole('main', { name: /review-1\// })).toBeVisible();
    await repositories.click();
    await expect(page.getByRole('dialog', { name: '工作流中的仓库', exact: true })).toContainText(
      '当前工作流还没有仓库。',
    );
    await workflows.click();
    await page
      .getByRole('dialog', { name: '我的工作流', exact: true })
      .getByRole('button', { name: /当前开发/ })
      .click();
    await expect(page.locator('.save-state')).toHaveText('已保存');
    const before = await store.read();
    await repositories.click();
    const outline = page.getByRole('dialog', { name: '工作流中的仓库', exact: true });
    await expect(outline.getByRole('button', { name: '客户端', exact: false })).toBeVisible();
    await expect(outline.locator('.repository-avatar')).toHaveCount(2);
    await page.screenshot({
      path: '.megit/verification/navigation-flyouts/repositories-dark.png',
      animations: 'disabled',
    });
    await outline.getByRole('button', { name: 'MeGit Desktop', exact: true }).click();
    await expect(outline).toHaveCount(0);
    await expect(page.locator('.dock-card .inspector-heading')).toContainText('MeGit Desktop');
    await expect(navigation).toHaveAttribute('data-collapsed', 'true');
    expect(await store.read()).toEqual(before);
    await page.screenshot({
      path: '.megit/verification/navigation-flyouts/selection-dark.png',
      animations: 'disabled',
    });
  } finally {
    await f.cleanup();
  }
});

test('浮层互斥，键盘可进入列表，Escape、外点、焦点离开和展开导航正确收起', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '收起工作流导航', exact: true }).click();
  const navigation = page.locator('#workspace-navigation');
  const workflows = navigation.getByRole('button', { name: '我的工作流', exact: true });
  const repositories = navigation.getByRole('button', { name: '工作流中的仓库', exact: true });
  await workflows.focus();
  await page.keyboard.press('ArrowRight');
  const list = page.getByRole('dialog', { name: '我的工作流', exact: true });
  await expect(list.locator('.board-item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(workflows).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await workflows.click();
  await repositories.click();
  await expect(list).toHaveCount(0);
  await expect(page.locator('.navigation-flyout')).toHaveCount(1);
  await repositories.click();
  await expect(page.locator('.navigation-flyout')).toHaveCount(0);
  await workflows.click();
  await page.mouse.click(600, 500);
  await expect(list).toHaveCount(0);
  await workflows.click();
  const preferences = navigation.getByRole('button', { name: '偏好设置', exact: true });
  await preferences.focus();
  await expect(list).toHaveCount(0);
  await expect(preferences).toBeFocused();
  await workflows.click();
  await list.getByRole('button', { name: '新建工作流', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '新建工作流', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await workflows.click();
  await page.getByRole('button', { name: '展开工作流导航', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
});

test.describe('明亮英文触控与矮窗口', () => {
  test.use({ viewport: { width: 900, height: 420 }, hasTouch: true });
  test('列表完整、可内部滚动且不溢出，窗口变窄后恢复抽屉', async ({ page, request }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      const second = path.join(f.root, 'desktop');
      await git(f.root, 'clone', f.repo, second);
      await seed(request, f.repo, second, 40);
      await page.addInitScript(() => {
        localStorage.setItem(
          'megit.preferences',
          JSON.stringify({
            version: 1,
            theme: 'light',
            language: 'en',
            navigationCollapsed: true,
          }),
        );
      });
      await page.goto('/');
      const navigation = page.locator('#workspace-navigation');
      const workflows = navigation.getByRole('button', { name: 'My workflows', exact: true });
      const size = (await workflows.boundingBox())!;
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
      await workflows.click();
      const list = page.getByRole('dialog', { name: 'My workflows', exact: true });
      await expect(list.locator('.board-item')).toHaveCount(40);
      const body = list.locator('.navigation-flyout-body');
      expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await list.locator('.board-item').last().scrollIntoViewIfNeeded();
      await expect(list).toBeVisible();
      expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      const box = (await list.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.y + box.height).toBeLessThanOrEqual(412);
      expect(box.x + box.width).toBeLessThanOrEqual(892);
      expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({
        path: '.megit/verification/navigation-flyouts/workflows-light-en-touch.png',
        animations: 'disabled',
      });
      await navigation.getByRole('button', { name: 'Repositories in workflow', exact: true }).click();
      await expect(list).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Repositories in workflow' })).toContainText(
        'MeGit Core',
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.navigation-flyout')).toHaveCount(0);
      await page.getByRole('button', { name: 'Open workflow navigation', exact: true }).click();
      await expect(navigation).toHaveAttribute('data-collapsed', 'false');
      await expect(
        navigation.getByRole('button', { name: 'MeGit Desktop', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await f.cleanup();
    }
  });
});

test('真实示例使用相同列表浮层且不请求工作区', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/design-system');
  const example = page.getByRole('region', { name: '工作流导航', exact: true });
  await example.getByRole('button', { name: '我的工作流', exact: true }).click();
  const list = page.getByRole('dialog', { name: '我的工作流', exact: true });
  await list.getByRole('button', { name: 'MeGit / release', exact: true }).click();
  await example.getByRole('button', { name: '我的工作流', exact: true }).click();
  await expect(list.locator('[aria-current]')).toContainText('MeGit / release');
  await page.keyboard.press('Escape');
  await example.getByRole('button', { name: '工作流中的仓库', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '工作流中的仓库', exact: true })).toContainText(
    'MeGit Desktop',
  );
  expect(apiRequests).toEqual([]);
});
