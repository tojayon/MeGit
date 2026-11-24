import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './test';

async function seedNotes(request: APIRequestContext) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.boards[0].notes = [
    { id: 'n1', title: '计划', text: '人工说明', position: { x: 200, y: 180 } },
    { id: 'n2', title: '验证', text: '临时测试数据', position: { x: 560, y: 300 } },
  ];
  workspace.boards[0].viewport = { x: 0, y: 0, zoom: 1 };
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

async function blankCanvas(page: Page) {
  await page.locator('.react-flow__pane').click({ position: { x: 80, y: 550 } });
}

for (const english of [false, true]) {
  test(`添加仓库关闭后恢复焦点且不残留提示，${english ? '明亮英文' : '暗黑中文'}`, async ({
    page,
  }) => {
    if (english)
      await page.addInitScript(() => {
        localStorage.setItem(
          'megit.preferences',
          JSON.stringify({
            version: 1,
            theme: 'light',
            language: 'en',
            navigationCollapsed: false,
          }),
        );
      });
    await page.goto('/');
    const add = page.getByRole('button', {
      name: english ? 'Add repository' : '添加仓库',
      exact: true,
    });
    for (const close of ['backdrop', 'escape', 'button']) {
      await add.hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await add.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      if (close === 'backdrop') await page.mouse.click(8, 8);
      else if (close === 'escape') await page.keyboard.press('Escape');
      else
        await dialog
          .getByRole('button', { name: english ? 'Cancel' : '取消', exact: true })
          .click();
      await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.mouse.move(8, 8);
    }
    // Restoring focus must stay quiet, but a new keyboard visit still explains the action.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(add).toBeFocused();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
}

test('画布按钮阻止冒泡时提示仍随激活关闭，悬停和聚焦只保留一个提示', async ({ page, request }) => {
  await seedNotes(request);
  await page.goto('/');
  const detail = page
    .locator('.react-flow__node[data-id="n1"]')
    .getByRole('button', { name: '说明详情', exact: true });
  await detail.hover();
  await expect(page.getByRole('tooltip')).toHaveText('说明详情');
  await detail.click();
  await expect(page.getByRole('dialog', { name: '说明详情', exact: true })).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭说明详情', exact: true }).click();
  await page.getByRole('button', { name: '偏好设置', exact: true }).focus();
  await page.getByRole('button', { name: '使用帮助', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await expect(page.getByRole('tooltip')).toHaveText('使用帮助');
  await blankCanvas(page);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const exportTrigger = page.getByRole('button', { name: '导出工作流', exact: true });
  await exportTrigger.click();
  await detail.click();
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('主动聚焦的提示先响应 Escape，弹窗保持打开且下次 Escape 正常关闭', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: '添加仓库', exact: true });
  await add.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('仓库路径', { exact: true }).focus();
  const close = dialog.getByRole('button', { name: '关闭添加本地仓库', exact: true });
  await close.focus();
  await expect(page.getByRole('tooltip')).toHaveText('关闭添加本地仓库');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('工作流设置可通过键盘打开，关闭后安静返回入口', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '工作流设置', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '工作流设置', exact: true });
  await expect(dialog.getByLabel('工作流名称')).toBeVisible();
  await expect(dialog.getByLabel('工作流说明')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('导出和排列菜单互斥，外点、Tab、Escape 与执行动作均收起', async ({ page, request }) => {
  await seedNotes(request);
  await page.goto('/');
  for (const id of ['n1', 'n2']) {
    await page
      .locator(`.react-flow__node[data-id="${id}"]`)
      .click({ modifiers: ['Control'], position: { x: 65, y: 42 } });
  }
  const exportTrigger = page.getByRole('button', { name: '导出工作流', exact: true });
  const arrange = page.getByRole('button', { name: '排列所选节点', exact: true });
  await arrange.click();
  await expect(arrange).toHaveAttribute('aria-expanded', 'true');
  await exportTrigger.click();
  await expect(arrange).toHaveAttribute('aria-expanded', 'false');
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '工作流设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭工作流设置', exact: true }).click();
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
  await exportTrigger.click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '导出 SVG', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
  await exportTrigger.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(exportTrigger).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await exportTrigger.click();
  await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await exportTrigger.click();
  await blankCanvas(page);
  await expect(exportTrigger).toHaveAttribute('aria-expanded', 'false');
});

test('窗口失焦与滚动清理临时浮层，菜单内滚动保留内容', async ({ page, request }) => {
  await seedNotes(request);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '导出工作流', exact: true });
  await trigger.hover();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await trigger.click();
  await page.locator('.canvas-menu-items').dispatchEvent('scroll');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.mouse.move(8, 8);
  await trigger.hover();
  await page.locator('.react-flow__pane').dispatchEvent('wheel', { deltaY: 20 });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await trigger.click();
  await page.locator('.react-flow__pane').dispatchEvent('wheel', { deltaY: 20 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('滚动或窗口变化关闭菜单时保留键盘落点，外部操作保留目标焦点', async ({ page, request }) => {
  await seedNotes(request);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '导出工作流', exact: true });
  for (const reason of ['wheel', 'resize', 'blur']) {
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: '导出 SVG', exact: true })).toBeFocused();
    if (reason === 'wheel')
      await page.locator('.react-flow__pane').dispatchEvent('wheel', { deltaY: 20 });
    else await page.evaluate((type) => window.dispatchEvent(new Event(type)), reason);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  }
  await page.keyboard.press('ArrowDown');
  const add = page.getByRole('button', { name: '添加仓库', exact: true });
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('触摸激活和恢复焦点不会粘住提示，窄屏抽屉与模态分层关闭', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const touch = await context.newPage();
    await touch.goto('/');
    await touch.getByRole('button', { name: '添加仓库', exact: true }).tap();
    await expect(touch.getByRole('tooltip')).toHaveCount(0);
    await touch.getByRole('button', { name: '取消', exact: true }).tap();
    await expect(touch.getByRole('tooltip')).toHaveCount(0);
    await touch.getByRole('button', { name: '打开工作流导航', exact: true }).tap();
    const nav = touch.locator('#workspace-navigation');
    await nav.getByRole('button', { name: '偏好设置', exact: true }).tap();
    await touch.keyboard.press('Escape');
    await expect(touch.getByRole('dialog', { name: '偏好设置', exact: true })).toHaveCount(0);
    await expect(nav).not.toHaveAttribute('inert', '');
    await expect(touch.getByRole('tooltip')).toHaveCount(0);
    await touch.keyboard.press('Escape');
    await expect(nav).toHaveAttribute('inert', '');
    await expect(touch.getByRole('button', { name: '打开工作流导航', exact: true })).toBeFocused();
    await expect(touch.getByRole('tooltip')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
