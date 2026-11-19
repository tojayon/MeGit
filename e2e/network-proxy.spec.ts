import { createServer } from 'node:http';
import { expect, test } from './test';

for (const english of [false, true]) {
  test(`network proxy settings · ${english ? 'light/en' : 'dark/zh'}`, async ({ page, request }) => {
    const targets: string[] = [];
    const proxy = createServer().on('connect', (req, socket) => {
      targets.push(req.url ?? '');
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
    }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => proxy.once('listening', resolve));
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const endpoint = '/api/network/settings';
    const initial = { enabled: false, address: '' };
    try {
      expect((await request.put(endpoint, { headers, data: initial })).ok()).toBe(true);
      const listener = proxy.address();
      if (!listener || typeof listener === 'string') throw new Error('Expected TCP address');
      const address = `http://127.0.0.1:${listener.port}`;
      await page.addInitScript((en) => {
        localStorage.setItem('megit.preferences', JSON.stringify({ version: 1, language: en ? 'en' : 'zh-CN', theme: en ? 'light' : 'dark' }));
      }, english);
      await page.goto('/');
      const settings = english ? 'Settings' : '软件设置';
      const open = async () => {
        await page.getByRole('button', { name: settings, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: settings, exact: true });
        await dialog.getByRole('button', { name: english ? 'Network proxy' : '网络代理', exact: true }).click();
        return dialog;
      };
      const dialog = await open();
      const input = dialog.getByRole('textbox', { name: english ? 'Proxy address' : '代理地址' });
      const enabled = dialog.getByRole('checkbox', { name: english ? 'Enable proxy for MeGit' : '为 MeGit 启用代理' });
      await input.fill(address);
      await dialog.getByRole('button', { name: english ? 'Test proxy' : '测试代理', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText(english ? 'Could not connect through' : '无法通过所选代理建立连接');
      expect(targets).toEqual(['github.com:443']);
      expect(await (await request.get(endpoint, { headers })).json()).toEqual(initial);
      await enabled.check();
      const save = dialog.getByRole('button', { name: english ? 'Save proxy settings' : '保存代理设置', exact: true });
      await expect(save).toBeDisabled();
      await page.route('**/api/network/test', (route) => route.fulfill({ json: { connected: true } }));
      await dialog.getByRole('button', { name: english ? 'Test proxy' : '测试代理', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText(english ? 'Reached GitHub' : '已通过代理连接 GitHub');
      await save.click();
      await expect(dialog.getByRole('status')).toContainText(english ? 'Proxy settings saved' : '代理设置已保存');
      await page.keyboard.press('Escape');
      await open();
      await expect(enabled).toBeChecked();
      await expect(input).toHaveValue(address);
      await enabled.uncheck();
      await dialog.getByRole('button', { name: english ? 'Save proxy settings' : '保存代理设置', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText(english ? 'Proxy settings saved' : '代理设置已保存');
      expect(await (await request.get(endpoint, { headers })).json()).toEqual({ enabled: false, address });
    } finally {
      await request.put(endpoint, { headers, data: initial });
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
}
