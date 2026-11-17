import { test, expect } from './test';
import type { Page } from '@playwright/test';
import packageInfo from '../package.json' with { type: 'json' };

const { version } = packageInfo;

async function expectControlsAligned(page: Page) {
  const frame = (await page.locator('.canvas-navigation-control').boundingBox())!;
  const rail = (await page.locator('.workspace-action-rail').boundingBox())!;
  const toggle = (await page.locator('.navigation-toggle:visible').boundingBox())!;
  const action = (await page.locator('.workspace-action-rail .icon-button').first().boundingBox())!;
  expect(frame.y).toBeCloseTo(rail.y, 1);
  expect(frame.width).toBeCloseTo(rail.width, 1);
  expect(frame.height).toBeCloseTo(frame.width, 1);
  expect(toggle.y).toBeCloseTo(action.y, 1);
  expect(toggle.width).toBeCloseTo(action.width, 1);
  expect(toggle.height).toBeCloseTo(action.height, 1);
  const editbar = (await page.locator('.canvas-editbar').boundingBox())!;
  const editButton = (await page
    .locator('.canvas-editbar > .canvas-tools .canvas-tool')
    .first()
    .boundingBox())!;
  expect(editButton.width).toBeCloseTo(toggle.width, 1);
  expect(editButton.height).toBeCloseTo(toggle.height, 1);
  if (editbar.y === frame.y) expect(editButton.y).toBeCloseTo(toggle.y, 1);
  expect(editbar.x >= frame.x + frame.width + 7 || editbar.y >= frame.y + frame.height + 7).toBe(
    true,
  );
}

test('桌面导航在面板与 Ribbon 间切换，Logo 透明且刷新恢复折叠选择', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const navigation = page.locator('#workspace-navigation');
  const canvas = page.locator('.workspace-canvas');
  const logo = navigation.getByRole('link', { name: 'MeGit 首页' });
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
  await expect(navigation).toHaveCSS('width', '212px');
  await expect(navigation.locator('.workspace-logo')).toHaveCSS('width', '84px');
  await expect(logo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const brandHeader = navigation.locator('.navigation-brand');
  await expect(navigation.locator('.sidebar-footer')).toHaveCount(0);
  await expect(navigation.getByText('本地服务', { exact: true })).toHaveCount(0);
  const badge = brandHeader.getByLabel(`版本 ${version}`, { exact: true });
  await expect(badge).toHaveText(`v${version}`);
  const expandedSymbol = (await logo.locator('image').boundingBox())!;
  const help = brandHeader.getByRole('button', { name: '使用帮助', exact: true });
  await expect(help).toHaveCount(1);
  await expect(
    navigation.locator('.navigation-bottom').getByRole('button', { name: '使用帮助', exact: true }),
  ).toHaveCount(0);
  await expect(brandHeader).toHaveCSS('height', '44px');
  const logoBox = (await logo.boundingBox())!;
  const helpBox = (await help.boundingBox())!;
  const brandHeaderBox = (await brandHeader.boundingBox())!;
  const badgeBox = (await badge.boundingBox())!;
  expect(badgeBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
  expect(badgeBox.y).toBeGreaterThan(logoBox.y);
  expect(badgeBox.y + badgeBox.height).toBeCloseTo(logoBox.y + logoBox.height, 0);
  expect(helpBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
  expect(brandHeaderBox.x + brandHeaderBox.width - helpBox.x - helpBox.width).toBeLessThanOrEqual(
    5,
  );
  await help.focus();
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-header')).toHaveCount(0);
  await expect(page.getByRole('main', { name: '开发流程', exact: true })).toBeVisible();
  await expect(navigation.locator('.board-item[aria-current]')).toContainText('开发流程');
  await expect(page.locator('.workspace-statusbar .save-state')).toHaveText('已保存');
  const rail = canvas.getByRole('group', { name: '白板操作', exact: true });
  await expect(rail).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  expect(canvasBox.y).toBe(0);
  expect(railBox.height).toBeGreaterThan(railBox.width * 3);
  expect(railBox.width).toBeLessThanOrEqual(50);
  expect(canvasBox.x + canvasBox.width - railBox.x - railBox.width).toBeCloseTo(12, 0);
  await rail.getByRole('button', { name: '白板详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '白板详情', exact: true })).toBeVisible();
  const inspectorCanvas = (await canvas.boundingBox())!;
  const inspectorRail = (await rail.boundingBox())!;
  expect(inspectorCanvas.width).toBe(canvasBox.width);
  expect(
    inspectorCanvas.x + inspectorCanvas.width - inspectorRail.x - inspectorRail.width,
  ).toBeCloseTo(12, 0);
  await page.getByRole('button', { name: '关闭白板详情', exact: true }).click();
  await page.screenshot({
    path: '.megit/verification/navigation/dark-expanded.png',
    animations: 'disabled',
  });

  await expect(navigation.getByRole('button', { name: '收起流程导航', exact: true })).toHaveCount(
    0,
  );
  const collapse = canvas.getByRole('button', { name: '收起流程导航', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expectControlsAligned(page);
  const toggleBox = (await canvas.locator('.canvas-navigation-control').boundingBox())!;
  expect(toggleBox.x - (await canvas.boundingBox())!.x).toBeCloseTo(12, 0);
  expect(toggleBox.y).toBeCloseTo(12, 0);
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(navigation).toHaveAttribute('data-collapsed', 'true');
  await expect(navigation).toHaveCSS('width', '56px');
  await expect(navigation.locator('.brand-mark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(navigation.locator('.workspace-logo')).toHaveCount(0);
  const collapsedSymbol = (await logo.locator('image').boundingBox())!;
  expect(collapsedSymbol.width).toBeCloseTo(expandedSymbol.width, 1);
  expect(collapsedSymbol.height).toBeCloseTo(expandedSymbol.height, 1);
  await expectControlsAligned(page);
  await expect(canvas.getByRole('button', { name: '展开流程导航' })).toBeFocused();
  expect((await canvas.locator('.canvas-navigation-control').boundingBox())!.x).toBeCloseTo(68, 0);
  expect((await page.locator('.main-workspace').boundingBox())?.x).toBe(56);
  await page.screenshot({
    path: '.megit/verification/navigation/dark-collapsed.png',
    animations: 'disabled',
  });
  await page.reload();
  await expect(navigation).toHaveAttribute('data-collapsed', 'true');
  await expect(navigation.getByRole('button', { name: '使用帮助', exact: true })).toHaveCount(1);
  await navigation
    .locator('.navigation-bottom')
    .getByRole('button', { name: '使用帮助', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭认识 MeGit', exact: true }).click();

  await navigation.getByRole('button', { name: '仓库索引', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '仓库索引' })).toBeVisible();
  await page.getByRole('button', { name: '关闭仓库索引' }).click();
  await navigation.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences' }).click();
  await expect(navigation).toHaveAttribute('aria-label', 'Workflow navigation');
  await expect(navigation.locator('.brand-mark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({
    path: '.megit/verification/navigation/light-collapsed-en.png',
    animations: 'disabled',
  });
  await canvas.getByRole('button', { name: 'Expand workflow navigation' }).click();
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
  await expect(navigation.locator('.workspace-logo')).toHaveCSS('width', '84px');
  await expect(brandHeader.getByRole('button', { name: 'Help', exact: true })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Help', exact: true })).toHaveCount(1);
  await expect(brandHeader.getByLabel(`Version ${version}`, { exact: true })).toHaveText(
    `v${version}`,
  );
  await expect(navigation.getByText('Local service', { exact: true })).toHaveCount(0);
  await expectControlsAligned(page);
  await expect(page.getByRole('main', { name: '开发流程', exact: true })).toBeVisible();
  await expect(canvas.getByRole('group', { name: 'Board actions', exact: true })).toBeVisible();
  await page.mouse.move(600, 300);
  await page.screenshot({
    path: '.megit/verification/navigation/light-expanded-en.png',
    animations: 'disabled',
  });
  await navigation.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('窄屏抽屉管理键盘焦点并保留桌面折叠偏好', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({
        version: 1,
        theme: 'dark',
        language: 'zh-CN',
        navigationCollapsed: true,
      }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.workspace-header')).toHaveCount(0);
  await page.getByRole('button', { name: '白板详情', exact: true }).click();
  const inspector = page.getByRole('dialog', { name: '白板详情', exact: true });
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: '关闭白板详情', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  const navigation = page.locator('#workspace-navigation');
  const opener = page.getByRole('button', {
    name: '打开流程导航',
    exact: true,
    includeHidden: true,
  });
  await expect(navigation).toHaveAttribute('inert', '');
  await opener.click();
  await expect(opener).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).toHaveAttribute('role', 'dialog');
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
  const close = navigation.getByRole('button', { name: '关闭流程导航', exact: true });
  await expect(close).toBeFocused();
  await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(0);
  await navigation.getByRole('link', { name: 'MeGit 首页' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(navigation.getByRole('button', { name: '偏好设置', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('link', { name: 'MeGit 首页' })).toBeFocused();
  await page.keyboard.press('Tab');
  const help = navigation
    .locator('.navigation-brand')
    .getByRole('button', { name: '使用帮助', exact: true });
  await expect(help).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(navigation).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.screenshot({
    path: '.megit/verification/navigation/mobile-dark.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(navigation).toHaveAttribute('inert', '');
  await expect(opener).toBeFocused();

  await opener.click();
  const preferences = navigation.getByRole('button', { name: '偏好设置', exact: true });
  await preferences.click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences' }).click();
  await expect(navigation.getByRole('button', { name: 'Preferences', exact: true })).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(navigation).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Open workflow navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open workflow navigation' }).click();
  await page.screenshot({
    path: '.megit/verification/navigation/mobile-light-en.png',
    animations: 'disabled',
  });
  await page.locator('.sidebar-scrim').click({ position: { x: 350, y: 400 } });
  await expect(navigation).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(navigation).toHaveAttribute('data-collapsed', 'true');
  await expect(navigation).not.toHaveAttribute('inert', '');
  await navigation.getByRole('button', { name: 'Workflow board', exact: true }).click();
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
});

test('画布两侧控件在桌面、折叠和触控窄屏保持同一尺寸与顶部对齐', async ({ browser, baseURL }) => {
  for (const hasTouch of [false, true]) {
    const context = await browser.newContext({
      baseURL,
      hasTouch,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('.workspace-action-rail')).toBeVisible();
      await expectControlsAligned(page);
      const size = hasTouch ? 44 : 32;
      await expect(page.locator('.navigation-toggle:visible')).toHaveCSS('width', `${size}px`);
      await page.getByRole('button', { name: '收起流程导航', exact: true }).click();
      await expectControlsAligned(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectControlsAligned(page);
      await page.getByRole('button', { name: '打开流程导航', exact: true }).click();
      await expect
        .poll(async () => (await page.locator('#workspace-navigation').boundingBox())?.x)
        .toBe(0);
      await expect(
        page.locator('.navigation-brand').getByLabel(`版本 ${version}`, { exact: true }),
      ).toBeVisible();
      const badgeBox = (await page.locator('.navigation-version').boundingBox())!;
      const helpBox = (await page
        .locator('.navigation-brand')
        .getByRole('button', { name: '使用帮助', exact: true })
        .boundingBox())!;
      expect(helpBox.x - badgeBox.x - badgeBox.width).toBeGreaterThanOrEqual(4);
      await page.getByRole('button', { name: '关闭流程导航', exact: true }).click();
      await page.setViewportSize({ width: 320, height: 700 });
      await expectControlsAligned(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await context.close();
    }
  }
});
