import { test, expect } from './test';

test('多个工作流标签可切换、独立关闭并在刷新后恢复', async ({ page, request }) => {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  for (const [id, name] of [
    ['review', '审查流程'],
    ['release', '发布流程'],
  ]) {
    workspace.boards.push({
      id,
      name,
      description: `${name}说明`,
      nodes: [],
      edges: [],
      viewport: { x: 42, y: 18, zoom: 1 },
    });
  }
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  const before = await (await request.get('/api/workspace', { headers })).json();
  const writes: string[] = [];
  page.on('request', (event) => {
    if (event.method() === 'PUT' && event.url().endsWith('/api/workspace'))
      writes.push(event.url());
  });
  await page.goto('/');
  const nav = page.locator('#workspace-navigation');
  const tabs = page.getByRole('tablist', { name: '工作流标签页' });
  await expect(tabs.getByRole('tab', { name: '开发流程' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await nav.getByRole('button', { name: /审查流程/ }).click();
  await nav.getByRole('button', { name: /发布流程/ }).click();
  await nav.getByRole('button', { name: /发布流程/ }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  await expect(tabs.getByRole('tab', { name: '发布流程' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const review = tabs.getByRole('tab', { name: '审查流程' });
  const reviewInfo = tabs.getByRole('button', { name: '工作流信息：审查流程', exact: true });
  const reviewClose = tabs.getByRole('button', { name: '关闭工作流面板：审查流程', exact: true });
  const [infoBox, tabBox, closeBox] = await Promise.all([
    reviewInfo.boundingBox(),
    review.boundingBox(),
    reviewClose.boundingBox(),
  ]);
  expect(infoBox!.x).toBeLessThan(tabBox!.x);
  expect(tabBox!.x).toBeLessThan(closeBox!.x);
  await reviewInfo.click();
  await expect(page.getByRole('dialog', { name: '工作流信息' })).toContainText('审查流程说明');
  await page.keyboard.press('Escape');
  await expect(tabs.getByRole('tab', { name: '发布流程' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await review.click();
  await expect(page.getByRole('tabpanel', { name: '审查流程' })).toBeVisible();
  await expect(page.locator('.react-flow__viewport')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 42, 18)',
  );
  await review.press('ArrowLeft');
  await expect(tabs.getByRole('tab', { name: '开发流程' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: '开发流程' })).toBeVisible();
  await reviewClose.click();
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(tabs.getByRole('tab', { name: '开发流程' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await tabs.getByRole('tab', { name: '开发流程' }).press('Delete');
  await expect(tabs.getByRole('tab', { name: '发布流程' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: '发布流程' })).toBeVisible();
  await page.reload();
  await expect(tabs.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: '发布流程' })).toBeVisible();
  await tabs.getByRole('button', { name: '关闭工作流面板：发布流程', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新打开工作流' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await page.getByRole('button', { name: '重新打开工作流' }).click();
  await expect(page.getByRole('tabpanel', { name: '发布流程' })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await (await request.get('/api/workspace', { headers })).json()).toEqual(before);
});

test('窄桌面窗口的长标签独立滚动，原生控件始终在同一行右端', async ({ page, request }) => {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  for (const index of [1, 2, 3, 4, 5]) {
    workspace.boards.push({
      id: `board-${index}`,
      name: `Workflow ${index} / ${'long-name-'.repeat(6)}`,
      description: '',
      nodes: [],
      edges: [],
    });
  }
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  await page.setViewportSize({ width: 640, height: 600 });
  await page.addInitScript(
    (ids) => {
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
      );
      sessionStorage.setItem(
        'megit.view-state',
        JSON.stringify({
          version: 1,
          entries: [
            ['app.workflow-tabs', ids],
            ['app.board', ids.at(-1)],
          ],
        }),
      );
      Object.defineProperty(window, 'megitDesktop', {
        value: async () => ({ systemTitleBar: false, closeToTray: false }),
      });
    },
    workspace.boards.map(({ id }: { id: string }) => id),
  );
  await page.goto('/');
  const header = page.locator('.workflow-panel > .workflow-header');
  const tabs = header.getByRole('tablist', { name: 'Workflow tabs' });
  const controls = header.getByRole('group', { name: 'Window controls' });
  await expect(controls).toBeVisible();
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  const last = tabs.getByRole('tab', { name: /^Workflow 5/ });
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await last.press('Home');
  await expect(tabs.getByRole('tab').first()).toBeFocused();
  await expect.poll(() => tabs.evaluate((element) => element.scrollLeft)).toBe(0);
  const [tabsBox, controlsBox, headerBox] = await Promise.all([
    tabs.boundingBox(),
    controls.boundingBox(),
    header.boundingBox(),
  ]);
  expect(controlsBox!.x).toBeGreaterThanOrEqual(tabsBox!.x + tabsBox!.width);
  expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(
    headerBox!.y + headerBox!.height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.megit/verification/workflow-tabs/desktop-light-en.png' });
});
