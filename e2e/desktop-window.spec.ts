import { test, expect } from './test';

test('网页版不显示原生设置，设计规范示例可查看但不可更改', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '软件设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '界面', exact: true })).toHaveCount(0);
  await page.goto('/design-system');
  await page.getByRole('button', { name: '软件设置', exact: true }).click();
  await page.getByRole('button', { name: '界面', exact: true }).click();
  await expect(page.getByRole('switch', { name: '显示系统标题栏' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: '关闭窗口时隐藏到系统托盘' })).toBeDisabled();
});

test('桌面设置即时应用、报告失败并在重新载入后恢复', async ({ page }) => {
  await page.addInitScript(() => {
    const invoke = async (request: { action: string; enabled: boolean }) => {
      const settings = {
        systemTitleBar: sessionStorage.getItem('test.titlebar') !== 'off',
        closeToTray: sessionStorage.getItem('test.tray') === 'on',
      };
      if (request.action === 'setSystemTitleBar') {
        settings.systemTitleBar = request.enabled;
        sessionStorage.setItem('test.titlebar', request.enabled ? 'on' : 'off');
      }
      if (request.action === 'setCloseToTray') {
        if (sessionStorage.getItem('test.failTray')) throw new Error('test failure');
        settings.closeToTray = request.enabled;
        sessionStorage.setItem('test.tray', request.enabled ? 'on' : 'off');
      }
      sessionStorage.setItem('test.lastDesktopAction', request.action);
      return settings;
    };
    Object.defineProperty(window, 'megitDesktop', { value: invoke });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '软件设置', exact: true }).click();
  await page.getByRole('button', { name: '界面', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '软件设置' });
  const titleBar = dialog.getByRole('switch', { name: '显示系统标题栏' });
  const tray = dialog.getByRole('switch', { name: '关闭窗口时隐藏到系统托盘' });
  await expect(titleBar).toBeChecked();
  await expect(tray).not.toBeChecked();
  await titleBar.uncheck();
  await expect(titleBar).not.toBeChecked();
  await page.evaluate(() => sessionStorage.setItem('test.failTray', 'yes'));
  await tray.click();
  await expect(dialog.getByRole('alert')).toContainText('无法更改窗口设置');
  await expect(tray).not.toBeChecked();
  await page.evaluate(() => sessionStorage.removeItem('test.failTray'));
  await tray.check();
  await expect(tray).toBeChecked();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  const header = page.locator('.main-workspace > .workflow-header');
  const windowControls = header.getByRole('group', { name: '窗口控件' });
  await expect(windowControls).toBeVisible();
  await expect(page.locator('#root > .desktop-title-bar')).toHaveCount(0);
  const [tabBox, controlsBox] = await Promise.all([
    header.getByRole('tab').boundingBox(),
    windowControls.boundingBox(),
  ]);
  expect(controlsBox!.x).toBeGreaterThan(tabBox!.x + tabBox!.width);
  await header.locator('.desktop-title-drag').dispatchEvent('mousedown', { button: 0 });
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('test.lastDesktopAction')))
    .toBe('drag');
  await page.getByRole('button', { name: '最小化窗口' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('test.lastDesktopAction')))
    .toBe('minimize');
  await page.getByRole('button', { name: '最大化或还原窗口' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('test.lastDesktopAction')))
    .toBe('toggleMaximize');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('test.lastDesktopAction')))
    .toBe('close');
  await header.getByRole('button', { name: '关闭工作流面板：开发流程' }).click();
  await expect(header.getByRole('tab')).toHaveCount(0);
  await expect(windowControls).toBeVisible();
  await page.getByRole('button', { name: '重新打开工作流' }).click();
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Interface', exact: true }).click();
  await expect(
    page.getByRole('switch', { name: 'Hide to the system tray on close' }),
  ).toBeChecked();
  const englishTitleBar = page.getByRole('switch', { name: 'Show system title bar' });
  await expect(englishTitleBar).not.toBeChecked();
  await englishTitleBar.check();
  await expect(englishTitleBar).toBeChecked();
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(0);
});
