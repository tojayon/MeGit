import { expect, test } from './test';

for (const { english, theme, compact } of [
  { english: false, theme: 'dark', compact: false },
  { english: false, theme: 'light', compact: false },
  { english: true, theme: 'light', compact: true },
]) {
  test(`software settings layout · ${theme}/${english ? 'en' : 'zh'} ${compact ? 'compact' : 'desktop'}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      compact ? { width: 390, height: 580 } : { width: 1360, height: 800 },
    );
    await page.addInitScript(
      ({ english: en, theme: appearance }) => {
        localStorage.setItem(
          'megit.preferences',
          JSON.stringify({ version: 1, language: en ? 'en' : 'zh-CN', theme: appearance }),
        );
      },
      { english, theme },
    );
    await page.route('**/api/ai/settings', (route) =>
      route.fulfill({
        json: {
          endpoint: 'https://example.invalid/v1',
          model: 'example-model',
          hasApiKey: true,
          projectDelivery: true,
        },
      }),
    );
    await page.goto('/');
    if (compact)
      await page
        .getByRole('button', {
          name: english ? 'Open workflow navigation' : '打开流程导航',
          exact: true,
        })
        .click();
    const name = english ? 'Settings' : '软件设置';
    const opener = page.getByRole('button', { name, exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    const delivery = dialog.getByRole('checkbox', {
      name: english ? 'Enable AI project delivery' : '启用 AI 项目交付',
    });
    const clearKey = dialog.getByRole('checkbox', {
      name: english ? 'Clear the saved key' : '清除已保存的密钥',
    });
    for (const control of [delivery, clearKey]) {
      await expect(control).toBeVisible();
      expect(
        await control.evaluate((input: HTMLInputElement) => {
          const controlBox = input.getBoundingClientRect();
          const label = input.labels![0];
          const text = document.createRange();
          text.selectNodeContents(label.querySelector('span') ?? label);
          const textBox = text.getBoundingClientRect();
          return (
            controlBox.right <= textBox.left &&
            textBox.top < controlBox.bottom &&
            textBox.bottom > controlBox.top
          );
        }),
      ).toBe(true);
    }
    const save = dialog.getByRole('button', {
      name: english ? 'Save AI settings' : '保存 AI 设置',
      exact: true,
    });
    const testConnection = dialog.getByRole('button', {
      name: english ? 'Test connection' : '测试连接',
      exact: true,
    });
    await expect(save).toBeInViewport();
    expect((await testConnection.boundingBox())!.x).toBeLessThan((await save.boundingBox())!.x);
    await expect(save).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('ai-service.png') });
    await delivery.focus();
    await page.keyboard.press('Space');
    await expect(delivery).not.toBeChecked();
    await expect(save).toBeEnabled();
    await expect(testConnection).toBeDisabled();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await expect(save).toBeInViewport();
    await dialog
      .getByRole('button', { name: english ? 'AI assistant' : 'AI 助手', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: english ? 'AI service' : 'AI 服务', exact: true })
      .click();
    await expect(delivery).not.toBeChecked();
    await expect(save).toBeEnabled();
    await dialog
      .getByRole('button', { name: english ? 'Network proxy' : '网络代理', exact: true })
      .click();
    await expect(
      dialog.getByRole('textbox', { name: english ? 'Proxy address' : '代理地址' }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('proxy.png') });
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });
}
