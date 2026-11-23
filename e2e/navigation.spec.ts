import { test, expect } from './test';
import type { Locator, Page } from '@playwright/test';
import packageInfo from '../package.json' with { type: 'json' };
import { commitFile, fixture } from '../tests/fixtures';

const { version } = packageInfo;

async function expectControlsAligned(page: Page) {
  await expect(page.locator('.navigation-toggle:visible')).toHaveCount(1);
  await expect(page.locator('.workspace-canvas .navigation-toggle')).toHaveCount(0);
}

async function horizontalCenter(locator: Locator) {
  const bounds = (await locator.boundingBox())!;
  return bounds.x + bounds.width / 2;
}

test('侧栏的右侧按钮、计数和图标共享同一对齐线', async ({ page, request }) => {
  const sample = await fixture();
  try {
    await commitFile(sample.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'repo-alignment', name: '技术示例', path: sample.repo }];
    workspace.boards[0].nodes = [
      { id: 'node-alignment', repoId: 'repo-alignment', position: { x: 80, y: 80 } },
    ];
    workspace.boards[0].groups = [
      { id: 'group-alignment', name: '示例分组', nodeIds: ['node-alignment'], collapsed: false },
    ];
    workspace.boards.push({
      id: 'review-alignment',
      name: '审核流程',
      description: '',
      nodes: [],
      edges: [],
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const navigation = page.locator('#workspace-navigation');
    const create = navigation.getByRole('button', { name: '新建流程', exact: true });
    const collapse = navigation.getByRole('button', { name: '收起流程导航', exact: true });
    const sectionIcon = navigation.locator('.flow-outline .sidebar-section-heading svg');
    const repoArrow = navigation.locator('.outline-repo:not(.outline-group-title) svg').last();
    const workflowCounts = await navigation.locator('.board-item small').all();
    const groupCount = navigation.locator('.outline-group-title small');
    await expect(groupCount).toHaveText('1');
    expect(workflowCounts).toHaveLength(2);
    for (const item of [sectionIcon, repoArrow, groupCount, ...workflowCounts]) {
      expect(await horizontalCenter(item)).toBeCloseTo(await horizontalCenter(create), 0);
    }
    expect(await horizontalCenter(collapse)).toBeCloseTo(await horizontalCenter(create), 0);
  } finally {
    await sample.cleanup();
  }
});

test('桌面导航在面板与 Ribbon 间切换，Logo 透明且刷新恢复折叠选择', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const navigation = page.locator('#workspace-navigation');
  const canvas = page.locator('.workspace-canvas');
  const logo = navigation.getByRole('link', { name: 'MeGit 首页' });
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
  await expect(navigation).toHaveCSS('width', '212px');
  await expect(navigation.locator('.workspace-logo')).toBeVisible();
  await expect(logo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const brandHeader = navigation.locator('.navigation-brand');
  await expect(navigation.locator('.sidebar-footer')).toHaveCount(0);
  await expect(navigation.getByText('本地服务', { exact: true })).toHaveCount(0);
  const badge = brandHeader.getByLabel(`版本 ${version}`, { exact: true });
  await expect(badge).toHaveText(`v${version}`);
  const logoBox = (await logo.boundingBox())!;
  const badgeBox = (await badge.boundingBox())!;
  const brandBox = (await brandHeader.boundingBox())!;
  const sidebarBox = (await navigation.boundingBox())!;
  expect(brandBox.x).toBe(sidebarBox.x);
  expect(brandBox.width).toBeCloseTo(sidebarBox.width - 1, 1);
  await expect(brandHeader).toHaveCSS('border-bottom-width', '1px');
  await expect(brandHeader).toHaveCSS('height', '64px');
  expect(logoBox.width).toBeGreaterThan(84);
  expect(badgeBox.x).toBeGreaterThan(logoBox.x + logoBox.width);
  expect(badgeBox.y + badgeBox.height).toBeCloseTo(logoBox.y + logoBox.height, 1);
  expect(badgeBox.x + badgeBox.width).toBeCloseTo(brandBox.x + brandBox.width - 8, 1);
  const help = navigation
    .locator('.navigation-bottom')
    .getByRole('button', { name: '使用帮助', exact: true });
  await expect(help).toHaveCount(1);
  await expect(brandHeader.getByRole('button', { name: '使用帮助', exact: true })).toHaveCount(0);
  await help.focus();
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-header')).toHaveCount(0);
  await expect(page.getByRole('main', { name: '开发流程', exact: true })).toBeVisible();
  const selectedWorkflow = navigation.locator('.board-item[aria-current]');
  await expect(selectedWorkflow).toContainText('开发流程');
  await expect(navigation.getByRole('button', { name: '流程白板', exact: true })).toHaveCount(0);
  await expect(selectedWorkflow).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const statusbar = page.locator('.workflow-panel .workspace-statusbar');
  await expect(statusbar.getByText('已保存', { exact: true })).toHaveCount(0);
  const statusButton = statusbar.getByRole('button', { name: '状态信息', exact: true });
  await statusButton.focus();
  await page.keyboard.press('Enter');
  const status = page.getByRole('dialog', { name: '状态信息', exact: true });
  await expect(status).toBeVisible();
  await expect(status.getByText('已保存', { exact: true })).toBeVisible();
  await expect(status.getByText('15 秒自动检查')).toBeVisible();
  const statusBox = (await status.boundingBox())!;
  const buttonBox = (await statusButton.boundingBox())!;
  expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(buttonBox.y);
  await page.keyboard.press('Escape');
  await expect(status).not.toBeVisible();
  await expect(statusButton).toBeFocused();
  const rail = canvas.getByRole('group', { name: '白板操作', exact: true });
  await expect(rail).toBeVisible();
  const railBox = (await rail.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  expect(canvasBox.y).toBe(
    (await page.locator('.workflow-panel > .workflow-header').boundingBox())!.height,
  );
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

  const collapse = navigation.getByRole('button', { name: '收起流程导航', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  const preferences = navigation.getByRole('button', { name: '偏好设置', exact: true });
  const management = navigation.getByRole('button', { name: '仓库管理', exact: true });
  await expect(navigation.locator('.navigation-bottom').getByRole('button').nth(1)).toHaveText(
    '仓库管理',
  );
  const divider = navigation.locator('.navigation-collapse-control');
  const line = divider.locator('.navigation-divider');
  await expect(line).toHaveCSS('border-top-width', '1px');
  const dividerBox = (await divider.boundingBox())!;
  const lineBox = (await line.boundingBox())!;
  const collapseBox = (await collapse.boundingBox())!;
  expect(dividerBox.x).toBe(sidebarBox.x);
  expect(dividerBox.width).toBeCloseTo(sidebarBox.width - 1, 1);
  expect(lineBox.x).toBe(sidebarBox.x);
  expect(lineBox.x + lineBox.width).toBeCloseTo(collapseBox.x, 0);
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(collapseBox.y + collapseBox.height / 2, 0);
  expect(dividerBox.x + dividerBox.width - collapseBox.x - collapseBox.width).toBeLessThan(8);
  expect(collapseBox.y).toBeLessThan((await management.boundingBox())!.y);
  expect((await management.boundingBox())!.y).toBeLessThan((await preferences.boundingBox())!.y);
  await expect(collapse).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const sharedIcons = navigation.locator('.navigation-bottom .navigation-action > svg');
  await expect(sharedIcons).toHaveCount(4);
  const iconPositions = () =>
    sharedIcons.evaluateAll((icons) =>
      icons.map((icon) => {
        const { x, y, width, height } = icon.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
  const expandedIcons = await iconPositions();
  await expectControlsAligned(page);
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(navigation).toHaveAttribute('data-collapsed', 'true');
  await expect(navigation).toHaveCSS('width', '56px');
  await expect.poll(iconPositions).toEqual(expandedIcons);
  await expect(navigation.locator('.brand-mark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(navigation.locator('.workspace-logo')).toBeHidden();
  await expect(navigation.locator('.workspace-logo')).toHaveCount(1);
  await expect(brandHeader).toHaveCSS('height', '64px');
  const collapsedSymbol = (await logo.locator('.workspace-logo-symbol image').boundingBox())!;
  expect(collapsedSymbol.width).toBeCloseTo(34, 1);
  expect(collapsedSymbol.height).toBeCloseTo(collapsedSymbol.width, 1);
  await expectControlsAligned(page);
  const expand = navigation.getByRole('button', { name: '展开流程导航' });
  await expect(expand).toBeFocused();
  await expect(line).toBeHidden();
  const ribbonBox = (await divider.boundingBox())!;
  const expandBox = (await expand.boundingBox())!;
  expect(expandBox.x - ribbonBox.x).toBeCloseTo(4, 0);
  expect(ribbonBox.x + ribbonBox.width - expandBox.x - expandBox.width).toBeCloseTo(4, 0);
  await page.getByRole('button', { name: /^关闭工作流面板：/ }).click();
  await expect(page.locator('.workspace-canvas')).toBeHidden();
  await expand.click();
  await expect(line).toBeVisible();
  await expect.poll(iconPositions).toEqual(expandedIcons);
  await selectedWorkflow.click();
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: /^关闭工作流面板：/ }).click();
  await collapse.click();
  await page.getByRole('button', { name: '重新打开工作流', exact: true }).click();
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

  await management.click();
  await expect(page.getByRole('dialog', { name: '仓库管理' })).toBeVisible();
  await page.getByRole('button', { name: '关闭仓库管理' }).click();
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
  await navigation.getByRole('button', { name: 'Expand workflow navigation' }).click();
  await expect(navigation).toHaveAttribute('data-collapsed', 'false');
  await expect(navigation.locator('.workspace-logo')).toBeVisible();
  await expect(selectedWorkflow).toHaveCSS('background-color', 'rgb(1, 53, 124)');
  await expect(
    navigation.getByRole('button', { name: 'Repository management', exact: true }),
  ).toBeVisible();
  await expect(
    navigation.locator('.navigation-bottom').getByRole('button', { name: 'Help', exact: true }),
  ).toBeVisible();
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

test('窄屏抽屉管理键盘焦点并保留桌面折叠偏好', async ({ page }, testInfo) => {
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
  await expect(navigation.getByRole('button', { name: '软件设置', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('link', { name: 'MeGit 首页' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  const help = navigation
    .locator('.navigation-bottom')
    .getByRole('button', { name: '使用帮助', exact: true });
  await help.focus();
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigation).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('tooltip', { name: '使用帮助', exact: true })).toHaveCount(0);
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
  const statusTrigger = page.getByRole('button', { name: 'Status information', exact: true });
  await statusTrigger.click();
  const status = page.getByRole('dialog', { name: 'Status information', exact: true });
  await expect(status.getByText('Saved', { exact: true })).toBeVisible();
  const statusBox = (await status.boundingBox())!;
  expect(statusBox.x).toBeGreaterThanOrEqual(0);
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath('workspace-status-light-en.png'),
    animations: 'disabled',
  });
  await page.mouse.click(195, 140);
  await expect(status).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(navigation).toHaveAttribute('data-collapsed', 'true');
  await expect(navigation).not.toHaveAttribute('inert', '');
  await expect(navigation.getByRole('button', { name: 'Workflow board', exact: true })).toHaveCount(
    0,
  );
  await navigation.getByRole('button', { name: 'Expand workflow navigation', exact: true }).click();
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
      await expect(
        page.locator('.navigation-bottom').getByRole('button', { name: '使用帮助', exact: true }),
      ).toBeVisible();
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
