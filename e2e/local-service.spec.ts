import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test } from './test';
import { commitFile, fixture } from '../tests/fixtures';

test('从仓库详情配置、启动、重启和停止项目服务，并保留外部端口占用者', async ({
  page,
  request,
}) => {
  test.skip(process.platform !== 'win32');
  const example = await fixture();
  const external = createServer();
  external.listen(0, '127.0.0.1');
  await once(external, 'listening');
  const { port } = external.address() as AddressInfo;
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const url = '/api/repositories/service-repo/local-service';
  try {
    await commitFile(example.repo);
    await writeFile(
      path.join(example.repo, 'package.json'),
      '{"scripts":{"dev":"node service.cjs"}}',
    );
    await writeFile(
      path.join(example.repo, 'service.cjs'),
      `
      require('node:http').createServer((req, res) => res.end(String(process.pid))).listen(${port}, '127.0.0.1');
      console.log('Example server output');
    `,
    );
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'service-repo', name: '演示项目', path: example.repo }];
    workspace.boards[0].nodes = [
      { id: 'service-card', repoId: 'service-repo', position: { x: 150, y: 260 } },
      {
        id: 'service-branch-card',
        repoId: 'service-repo',
        ref: 'refs/heads/main',
        position: { x: 470, y: 260 },
      },
    ];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    const card = page.locator('[data-id="service-card"]').getByTestId('repository-node');
    const cardControls = card.getByRole('group', { name: '本地服务', exact: true });
    const open = card.getByRole('button', { name: '查看演示项目', exact: true });
    await expect(cardControls).toHaveCount(0);
    await open.click();
    const shortcut = page.getByRole('button', { name: '本地服务', exact: true });
    await shortcut.focus();
    await expect(page.getByRole('tooltip', { name: '本地服务' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip', { name: '本地服务' })).not.toBeVisible();
    await shortcut.click();
    const dialog = page.getByRole('dialog', { name: '本地服务', exact: true });
    await dialog.getByRole('button', { name: '配置', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'TCP 端口（可选）' }).fill(String(port));
    const save = dialog.getByRole('button', { name: '保存配置' });
    await expect(save).toBeDisabled();
    await dialog.getByRole('checkbox', { name: /我已审核并信任/ }).check();
    await save.click();
    await expect(dialog.getByRole('status')).toHaveText('已停止');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    const start = cardControls.getByRole('button', { name: '开始运行', exact: true });
    await expect(start.locator('svg.lucide-play')).toBeVisible();
    await start.hover();
    await expect(page.getByRole('tooltip', { name: '开始运行', exact: true })).toBeVisible();
    await expect(
      page.locator('[data-id="service-branch-card"]').getByRole('group', { name: '本地服务' }),
    ).toHaveCount(0);
    const summaries = `/api/local-services?boardId=${encodeURIComponent(workspace.boards[0].id)}`;
    expect((await request.get(summaries)).status()).toBe(403);
    const { config } = await (await request.get(url, { headers })).json();
    expect(await (await request.get(summaries, { headers })).json()).toEqual([
      { repoId: 'service-repo', revision: config.revision, status: 'stopped' },
    ]);
    const openBox = (await open.boundingBox())!;
    const startBox = (await start.boundingBox())!;
    const metaBox = (await card.locator('.repository-card-meta').boundingBox())!;
    expect(startBox.x).toBeCloseTo(openBox.x, 0);
    expect(startBox.y).toBeGreaterThanOrEqual(openBox.y + openBox.height);
    expect(startBox.x).toBeGreaterThan(metaBox.x + metaBox.width);
    const glow = () => card.evaluate((node) => getComputedStyle(node, '::before').animationName);
    await expect.poll(glow).toBe('none');
    await start.click();
    await expect(card.getByRole('alert')).toContainText('已被其他进程占用');
    expect(external.listening).toBe(true);
    external.close();
    await once(external, 'close');
    await start.click();
    const cardStatus = cardControls.getByRole('status');
    await expect(cardStatus).toHaveText('运行中');
    await expect(cardControls.getByRole('button')).toHaveCount(1);
    await expect.poll(glow).toBe('repository-card-service-glow');
    await card.screenshot({ path: test.info().outputPath('card-dark-zh.png') });
    await shortcut.click();
    await expect(dialog.getByRole('status')).toHaveText('运行中');
    const address = `http://127.0.0.1:${port}`;
    await expect(dialog.getByRole('link', { name: '打开服务' })).toHaveAttribute('href', address);
    const pid = async () => (await request.get(address)).text();
    const first = await pid();
    const header = dialog.locator('header');
    await expect(header.getByRole('status')).toHaveText('运行中');
    await expect(header.locator('code')).toHaveText('npm run dev');
    const output = dialog.locator('pre[aria-label="最近输出"]');
    await expect(output).toBeVisible();
    await expect(output).toContainText('Example server output');
    await expect(output).not.toContainText('CLIXML');
    await expect(dialog.getByText('最近输出', { exact: true })).toHaveCount(0);
    await expect(dialog.locator('details')).toHaveCount(0);
    const stop = dialog.getByRole('button', { name: '停止', exact: true });
    const restart = dialog.getByRole('button', { name: '重启', exact: true });
    await expect(stop).toHaveClass(/\bdanger\b/);
    await expect(stop.locator('svg.lucide-square')).toBeVisible();
    await expect(restart.locator('svg.lucide-rotate-cw')).toBeVisible();
    const headerBox = (await header.boundingBox())!;
    const footerBox = (await dialog.locator('footer').boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.width).toBeGreaterThan(800);
    expect(headerBox.height).toBe(41);
    expect(footerBox.height).toBe(headerBox.height);
    expect((await output.boundingBox())!.height).toBeGreaterThan(dialogBox.height / 2);
    await dialog.screenshot({ path: test.info().outputPath('terminal-dark-zh.png') });
    await restart.click();
    await expect.poll(() => pid().catch(() => first)).not.toBe(first);
    await expect(dialog.getByRole('status')).toHaveText('运行中');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(shortcut).toBeFocused();
    await expect(cardStatus).toHaveText('运行中');
    const cardStop = cardControls.getByRole('button', { name: '停止', exact: true });
    await expect(cardStop.locator('svg.lucide-square')).toBeVisible();
    await cardStop.focus();
    await expect(page.getByRole('tooltip', { name: '停止', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip', { name: '停止', exact: true })).not.toBeVisible();
    await cardStop.click();
    await expect(start).toBeEnabled();
    await expect.poll(glow).toBe('none');
    await expect(request.get(address, { timeout: 1000 })).rejects.toThrow();
  } finally {
    if (external.listening) {
      external.close();
      await once(external, 'close');
    }
    const state = await (await request.get(url, { headers })).json();
    if (state.config)
      await request.post(url, {
        headers,
        data: { action: 'stop', revision: state.config.revision },
      });
    await example.cleanup();
  }
});

test('本地服务规范示例适配明亮英文窄屏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript(() =>
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
    ),
  );
  await page.goto('/design-system');
  const card = page
    .getByTestId('repository-node')
    .filter({ hasText: 'repository-with-a-long-name' });
  const controls = card.getByRole('group', { name: 'Local service', exact: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cardStart = controls.getByRole('button', { name: 'Start service', exact: true });
  await cardStart.press('Enter');
  await expect(controls.getByRole('status')).toHaveText('Running');
  const glow = () =>
    card.evaluate((node) => {
      const style = getComputedStyle(node, '::before');
      return { name: style.animationName, background: style.backgroundImage };
    });
  await expect.poll(glow).toEqual({
    name: 'none',
    background: expect.stringContaining('radial-gradient'),
  });
  await expect(controls.getByRole('button')).toHaveCount(1);
  const cardStop = controls.getByRole('button', { name: 'Stop', exact: true });
  await expect(cardStop).toBeFocused();
  await card.screenshot({ path: test.info().outputPath('card-light-en.png') });
  await cardStop.press('Enter');
  await expect(cardStart).toBeFocused();
  await expect.poll(glow).toEqual({ name: 'none', background: 'none' });
  const example = page.getByRole('region', { name: 'Local service', exact: true });
  const header = example.locator('header');
  const footer = example.locator('footer');
  const output = example.locator('pre[aria-label="Recent output"]');
  await expect(example.getByRole('status')).toHaveText('Running');
  await expect(output).toContainText('npm run dev');
  await expect(output).toHaveCSS('background-color', 'rgb(22, 24, 27)');
  await expect(output).toHaveCSS('color', 'rgb(215, 220, 229)');
  await expect(header).toHaveCSS('background-color', 'rgb(36, 40, 46)');
  await expect(footer).toHaveCSS('background-color', 'rgb(36, 40, 46)');
  const headerBox = (await header.boundingBox())!;
  expect(headerBox.height).toBe(45);
  expect((await footer.boundingBox())!.height).toBe(headerBox.height);
  await example.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(example.getByRole('status')).toHaveText('Stopped');
  await example.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(example.getByRole('status')).toHaveText('Running');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => example.evaluate((section) => section.scrollWidth - section.clientWidth))
    .toBe(0);
  await example.screenshot({ path: test.info().outputPath('terminal-light-en.png') });
});
