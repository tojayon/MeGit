import type { Locator } from '@playwright/test';
import { test, expect } from './test';

async function expectComposerNotch(panel: Locator, sendLabel: string, size = 36) {
  const page = panel.page();
  const composer = (await panel.locator('.assistant-composer').boundingBox())!;
  const send = (await panel.getByRole('button', { name: sendLabel, exact: true }).boundingBox())!;
  const right = composer.x + composer.width;
  const samples = [
    [right + 3, send.y + send.height / 2],
    [send.x - 2, send.y + send.height / 2],
    [send.x + send.width / 2, send.y - 2],
    [send.x - 16, send.y + send.height - 4],
  ];
  const png = await page.screenshot({ scale: 'css' });
  const [panelColor, leftGap, topGap, surface] = await page.evaluate(
    async ({ screenshot, samples }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${screenshot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return samples.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    },
    { screenshot: png.toString('base64'), samples },
  );
  expect(surface).not.toEqual(panelColor);
  expect(leftGap).toEqual(panelColor);
  expect(topGap).toEqual(panelColor);
  expect(send).toMatchObject({ width: size, height: size });
  expect(send.x + send.width).toBe(right);
  expect(send.y + send.height).toBe(composer.y + composer.height);
}

test('边缘悬浮入口与八向缩放、贴边、无输入聚焦框和明亮深色标题栏', async ({ page }) => {
  await page.goto('/');
  const launcher = page.getByRole('button', { name: 'AI 助手', exact: true });
  await expect(launcher).toHaveClass(/assistant-launcher/);
  const avatar = 'img[src="/brand/megit-assistant-avatar.svg"]';
  await expect(launcher.locator(avatar)).toHaveJSProperty('naturalWidth', 64);
  const expectStableLauncher = async (button: Locator, background: string) => {
    await page.mouse.move(10, 10);
    await expect(button).toHaveCSS('background-color', background);
    await button.locator(avatar).hover();
    await expect(button).toHaveCSS('background-color', background);
    await expect(button.locator(avatar)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(button.locator(avatar)).toHaveCSS('filter', 'none');
    await page.mouse.move(10, 10);
  };
  await expectStableLauncher(launcher, 'rgb(29, 32, 36)');
  const initial = (await launcher.boundingBox())!;
  expect(initial).toMatchObject({ width: 62, height: 56 });
  await expect(launcher).toHaveCSS('border-top-width', '0px');
  await expect(launcher.locator(avatar)).toHaveCSS('width', '40px');
  expect(initial.x + initial.width).toBe(1280);
  await expect(launcher).toHaveCSS('border-top-right-radius', '0px');
  await launcher.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await launcher.boundingBox())!.x).toBe(0);
  await expect(launcher).toHaveCSS('border-top-left-radius', '0px');
  const left = (await launcher.boundingBox())!;
  await page.mouse.move(left.x + 28, left.y + 28);
  await page.mouse.down();
  await page.mouse.move(640, 300, { steps: 4 });
  await expect(launcher).toHaveAttribute('data-dragging', 'true');
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await expect(launcher).toHaveCSS(`border-${corner}-radius`, '28px');
  }
  await page.mouse.move(1220, 300, { steps: 8 });
  await page.mouse.up();
  await expect(launcher).toHaveAttribute('data-edge', 'right');
  await expect(launcher).toHaveCSS('border-top-right-radius', '0px');
  await expect(launcher).toHaveAttribute('aria-expanded', 'false');
  await launcher.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const savedY = (await launcher.boundingBox())!.y;
  await launcher.click();
  const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('header').locator(avatar)).toBeVisible();
  await expect(panel.locator('.assistant-welcome').locator(avatar)).toBeVisible();
  await expect(launcher).toBeHidden();
  await expect(panel.locator('[data-resize-edge]')).toHaveCount(8);
  const input = panel.getByRole('textbox', { name: '给 AI 助手的消息' });
  await input.focus();
  await expect(input).toHaveCSS('outline-style', 'none');
  await expect(input).toHaveCSS('box-shadow', 'none');
  for (const [edge, dx, dy] of [
    ['nw', -1500, -1000],
    ['se', 1500, 1000],
  ] as const) {
    const box = (await panel.locator(`[data-resize-edge="${edge}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + dx, box.y + dy, { steps: 5 });
    await page.mouse.up();
  }
  await expect
    .poll(async () => await panel.boundingBox())
    .toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  await page.reload();
  await expect
    .poll(async () => await panel.boundingBox())
    .toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  await panel.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await expect(launcher).toBeVisible();
  expect((await launcher.boundingBox())!.y).toBe(savedY);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.keyboard.press('Escape');
  const lightLauncher = page.getByRole('button', { name: 'AI assistant', exact: true });
  await expectStableLauncher(lightLauncher, 'rgb(255, 255, 255)');
  await lightLauncher.click();
  const lightPanel = page.getByRole('complementary', { name: 'MeGit AI assistant' });
  await expect(lightPanel.locator('header')).toHaveCSS('background-color', 'rgb(1, 53, 124)');
  await expect(lightPanel.locator('header')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(lightPanel.locator('header').locator(avatar)).toHaveJSProperty('naturalWidth', 64);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => await lightPanel.boundingBox())
    .toEqual({ x: 0, y: 0, width: 390, height: 720 });
  await lightPanel.locator('[data-resize-edge="s"]').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
  await expect
    .poll(async () => await lightPanel.boundingBox())
    .toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await lightPanel.getByRole('textbox', { name: 'Message to the AI assistant' }).focus();
  const longModel = 'example-provider/model-name-that-must-fit-in-a-narrow-window';
  await page.route('**/api/ai/settings', (route) =>
    route.fulfill({ json: { endpoint: 'https://example.invalid/v1', model: longModel } }),
  );
  await page.reload();
  const modelButton = lightPanel.getByRole('button', { name: 'Quick AI settings', exact: true });
  await expect(modelButton).toContainText(longModel);
  await page.screenshot({ path: '.megit/verification/assistant/window-light.png' });
  const composer = lightPanel.locator('.assistant-composer');
  await expect.poll(() => composer.evaluate((row) => row.scrollWidth - row.clientWidth)).toBe(0);
  const panelBox = (await lightPanel.boundingBox())!;
  const composerBox = (await composer.boundingBox())!;
  expect(composerBox.x + composerBox.width).toBeLessThan(panelBox.x + panelBox.width);
  const toolbarButtons = composer.locator('.assistant-composer-footer button');
  await expect(toolbarButtons).toHaveCount(4);
  const boxes = await Promise.all((await toolbarButtons.all()).map((button) => button.boundingBox()));
  for (let index = 1; index < boxes.length; index++) {
    const previous = boxes[index - 1]!;
    expect(boxes[index]!.x).toBeGreaterThanOrEqual(previous.x + previous.width);
  }
  const modelLabel = composer.locator('.assistant-model');
  await expect(modelLabel).toHaveCSS('text-overflow', 'ellipsis');
  await expect
    .poll(() => modelLabel.evaluate((label) => label.scrollWidth > label.clientWidth))
    .toBe(true);
  await expectComposerNotch(lightPanel, 'Send message');
  await lightPanel.screenshot({ path: test.info().outputPath('composer-light-en.png') });
  await modelButton.click();
  await expect(page.getByRole('dialog', { name: 'Quick AI settings', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('quick-settings-light-en.png') });
  await page.keyboard.press('Escape');
  await expect(lightPanel).toBeVisible();
});

test('规范页复用真实悬浮球和窗口，不请求工作区或 AI 服务', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  await page.goto('/design-system');
  await page.screenshot({ path: '.megit/verification/assistant/window-launcher.png' });
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-resize-edge]')).toHaveCount(8);
  await expectComposerNotch(panel, '发送消息');
  await page.screenshot({ path: '.megit/verification/assistant/window-dark.png' });
  await panel.getByRole('button', { name: 'AI 快捷设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'AI 快捷设置', exact: true });
  await expect(settings.getByLabel('模型', { exact: true })).toHaveValue('example-model');
  await expect(settings.getByRole('button', { name: '测试连接' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('quick-settings-dark-zh.png') });
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  expect(requests).toEqual([]);
});

test.describe('触屏输入框', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('发送按钮保持 44 px 点击面积并嵌在齐平凹口', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).tap();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    await expectComposerNotch(panel, '发送消息', 44);
  });
});
