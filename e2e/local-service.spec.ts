import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import type { Locator } from '@playwright/test';
import { expect, test } from './test';
import { commitFile, fixture } from '../tests/fixtures';

function glyphOffset(button: Locator) {
  return button.evaluate((node) => {
    const buttonBox = node.getBoundingClientRect();
    const glyphBox = node.querySelector('svg')!.getBoundingClientRect();
    return {
      x: glyphBox.left + glyphBox.width / 2 - (buttonBox.left + buttonBox.width / 2),
      y: glyphBox.top + glyphBox.height / 2 - (buttonBox.top + buttonBox.height / 2),
    };
  });
}

test('圆形服务按钮半嵌在卡片上沿，悬停和启停不移动按钮', async ({ page }) => {
  await page.goto('/design-system');
  const section = page.getByRole('region', { name: '仓库卡片', exact: true });
  const card = section.getByTestId('repository-node');
  const controls = card.getByRole('group', { name: '本地服务', exact: true });
  const start = controls.getByRole('button', { name: '开始运行', exact: true });
  const appearance = (button: typeof start) =>
    button.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        border: style.border,
        color: style.color,
        shadow: style.boxShadow,
        transform: style.transform,
        scale: style.scale,
      };
    });
  await section.scrollIntoViewIfNeeded();
  const getGeometry = () =>
    card.evaluate((node) => {
      const { top, right, width, height } = node.getBoundingClientRect();
      const controls = node.querySelector('.local-service-card-controls')!;
      const button = controls.querySelector('button')!;
      const bounds = button.getBoundingClientRect();
      return {
        size: { width, height },
        centerOffset: bounds.top + bounds.height / 2 - top,
        rightInset: right - bounds.right,
        buttonHit: button.contains(
          document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
        ),
      };
    });
  const stopped = await getGeometry();
  expect(stopped.centerOffset).toBeCloseTo(0, 0);
  expect(stopped.rightInset).toBeCloseTo(26, 0);
  expect(stopped.buttonHit).toBe(true);
  await expect(start).toHaveCSS('border-radius', '50%');
  await expect(start).toHaveCSS('background-color', 'rgb(170, 224, 98)');
  expect(await glyphOffset(start)).toEqual({ x: 1, y: 0 });
  const notch = await card.evaluate((node) => ({
    outline: getComputedStyle(node, '::before').clipPath,
    surface: getComputedStyle(node, '::after').clipPath,
  }));
  for (const [outline, radius] of [
    [notch.outline, 16],
    [notch.surface, 17],
  ] as const) {
    expect(outline).toMatch(/^shape\(from [^,]+, hline to [^,]+, arc to [^,]+ 0px of /);
    expect(outline).toContain(`of ${radius}px 16px`);
  }
  await section.screenshot({ path: test.info().outputPath('notch-dark-stopped.png') });
  const stoppedAppearance = await appearance(start);
  await start.hover();
  await expect(page.getByRole('tooltip', { name: '开始运行', exact: true })).toBeVisible();
  expect(await appearance(start)).toEqual(stoppedAppearance);
  expect(await getGeometry()).toEqual(stopped);
  await start.click();
  const stop = controls.getByRole('button', { name: '停止', exact: true });
  const uptime = controls.getByRole('timer');
  await expect(uptime).toBeVisible();
  const timerBox = (await uptime.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  const stopBox = (await stop.boundingBox())!;
  expect(timerBox.y + timerBox.height).toBeLessThan(cardBox.y);
  expect(timerBox.x + timerBox.width).toBeLessThan(stopBox.x);
  await expect(stop).toHaveCSS('border-radius', '50%');
  await expect(stop).toHaveCSS('background-color', 'rgb(255, 155, 167)');
  expect(await glyphOffset(stop)).toEqual({ x: 0, y: 0 });
  await page.mouse.move(1, 1);
  await expect.poll(getGeometry).toEqual(stopped);
  await section.screenshot({ path: test.info().outputPath('notch-dark-running.png') });
  const runningAppearance = await appearance(stop);
  await stop.hover();
  await expect(page.getByRole('tooltip', { name: '停止', exact: true })).toBeVisible();
  expect(await appearance(stop)).toEqual(runningAppearance);
  expect(await getGeometry()).toEqual(stopped);
  await stop.click();
  await expect(start).toBeEnabled();
});

test('无悬停的触屏可以直接点击服务按钮', async ({ browser, baseURL }) => {
  const page = await browser.newPage({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 850 },
  });
  try {
    await page.goto('/design-system');
    const section = page.getByRole('region', { name: '仓库卡片', exact: true });
    const card = section.getByTestId('repository-node');
    const controls = card.getByRole('group', { name: '本地服务', exact: true });
    const start = controls.getByRole('button', { name: '开始运行', exact: true });
    await section.scrollIntoViewIfNeeded();
    const cardBox = (await card.boundingBox())!;
    const startBox = (await start.boundingBox())!;
    expect(startBox.y + startBox.height / 2).toBeCloseTo(cardBox.y, 0);
    const cardMeta = (await card.locator('.repository-card-meta').boundingBox())!;
    expect(cardMeta.y).toBeGreaterThanOrEqual(startBox.y + startBox.height);
    expect(startBox.height).toBeGreaterThanOrEqual(44);
    await start.tap();
    await expect(controls.getByRole('button', { name: '停止', exact: true })).toBeVisible();
  } finally {
    await page.close();
  }
});

test('从仓库详情配置、启动、重启和停止项目服务，并保留外部端口占用者', async ({
  baseURL,
  browser,
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
    const uptime = card.getByRole('timer', { name: '服务已运行时长' });
    const open = card
      .getByRole('heading', { name: '演示项目', exact: true })
      .getByRole('button', { name: '查看演示项目', exact: true });
    await expect(cardControls).toHaveCount(0);
    await expect(card.locator('.lucide-arrow-up-right')).toHaveCount(0);
    await open.press('Enter');
    const shortcut = page.getByRole('button', { name: '本地服务', exact: true });
    await shortcut.focus();
    await expect(page.getByRole('tooltip', { name: '本地服务' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip', { name: '本地服务' })).not.toBeVisible();
    await shortcut.click();
    const dialog = page.getByRole('dialog', { name: '本地服务', exact: true });
    const openService = dialog.getByRole('link', { name: '打开服务', exact: true });
    await dialog.getByRole('button', { name: '配置', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'TCP 端口（可选）' }).fill(String(port));
    const save = dialog.getByRole('button', { name: '保存配置' });
    await expect(save).toBeDisabled();
    await dialog.getByRole('checkbox', { name: /我已审核并信任/ }).check();
    await save.click();
    await expect(dialog.getByRole('status')).toHaveText('已停止');
    await expect(openService).toHaveCount(0);
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
    const cardBox = (await card.boundingBox())!;
    const startBox = (await start.boundingBox())!;
    const stoppedTab = (await cardControls.boundingBox())!;
    expect(startBox.width).toBeCloseTo(startBox.height, 0);
    expect(startBox.y + startBox.height / 2).toBeCloseTo(cardBox.y, 0);
    const rightGap = cardBox.x + cardBox.width - (stoppedTab.x + stoppedTab.width);
    const scale = cardBox.width / (await card.evaluate((node: HTMLElement) => node.offsetWidth));
    expect(rightGap / scale).toBeCloseTo(26, 0);
    await expect(card).toHaveCSS('border-top-right-radius', '8px');
    await expect(uptime).toHaveCount(0);
    await start.click();
    await expect(card.getByRole('alert')).toContainText('已被其他进程占用');
    await expect(uptime).toHaveCount(0);
    expect(external.listening).toBe(true);
    external.close();
    await once(external, 'close');
    await start.click();
    const cardStatus = cardControls.getByRole('status');
    await expect(cardStatus).toHaveText('运行中');
    await expect(cardControls.getByRole('button')).toHaveCount(1);
    await expect(uptime).toHaveText(/^00:00:\d{2}$/);
    const firstUptime = await uptime.textContent();
    await expect(uptime).not.toHaveText(firstUptime!);
    const getRunningSince = async () => {
      const [summary] = await (await request.get(summaries, { headers })).json();
      return summary.runningSince;
    };
    const firstRunningSince = await getRunningSince();
    expect(firstRunningSince).toEqual(expect.any(Number));
    const refreshed = await browser.newPage({ baseURL });
    try {
      await refreshed.clock.setFixedTime(firstRunningSince + 90061000);
      await refreshed.goto('/');
      await expect(refreshed.getByRole('timer', { name: '服务已运行时长' })).toHaveText(
        '01天01:01:01',
      );
    } finally {
      await refreshed.close();
    }
    const branchCard = page.locator('[data-id="service-branch-card"]').getByTestId('repository-node');
    await branchCard.locator('.repository-avatar').click();
    await expect(branchCard).toHaveClass(/\bis-selected\b/);
    const selectedBorder = await branchCard.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(node).borderTopColor;
    });
    await card.locator('.repository-avatar').click();
    await expect(card).toHaveClass(/\bis-selected\b/);
    await expect(card).toHaveCSS('filter', 'none');
    await expect
      .poll(() => card.evaluate((node) => getComputedStyle(node, '::before').backgroundColor))
      .toBe(selectedBorder);
    await expect(cardControls.getByRole('button', { name: '停止', exact: true })).toHaveCSS(
      'border-top-color',
      selectedBorder,
    );
    await expect
      .poll(() => card.evaluate((node) => getComputedStyle(node, '::before').backgroundImage))
      .toBe('none');
    await page.screenshot({ path: test.info().outputPath('card-dark-zh.png') });
    await shortcut.click();
    await expect(dialog.getByRole('status')).toHaveText('运行中');
    const address = `http://127.0.0.1:${port}`;
    const footer = dialog.locator('footer');
    await expect(footer.getByRole('link', { name: '打开服务', exact: true })).toHaveAttribute(
      'href',
      address,
    );
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
    const footerBox = (await footer.boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.width).toBeGreaterThan(800);
    expect(headerBox.height).toBe(41);
    expect(footerBox.height).toBe(headerBox.height);
    expect((await openService.boundingBox())!.x - footerBox.x).toBeCloseTo(12, 0);
    expect((await stop.boundingBox())!.x).toBeGreaterThan((await openService.boundingBox())!.x);
    expect((await output.boundingBox())!.height).toBeGreaterThan(dialogBox.height / 2);
    await dialog.screenshot({ path: test.info().outputPath('terminal-dark-zh.png') });
    const [servicePage] = await Promise.all([
      page.waitForEvent('popup'),
      openService.press('Enter'),
    ]);
    try {
      await expect(servicePage).toHaveURL(`${address}/`);
      await expect(servicePage.locator('body')).toHaveText(first);
      await expect(dialog).toBeVisible();
    } finally {
      await servicePage.close();
    }
    await restart.click();
    await expect.poll(() => pid().catch(() => first)).not.toBe(first);
    await expect(dialog.getByRole('status')).toHaveText('运行中');
    await expect.poll(getRunningSince).toBeGreaterThan(firstRunningSince);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(shortcut).toBeFocused();
    await expect(cardStatus).toHaveText('运行中');
    await expect(uptime).toHaveText(/^00:00:\d{2}$/);
    const cardStop = cardControls.getByRole('button', { name: '停止', exact: true });
    await cardStop.focus();
    await expect(cardStop.locator('svg.lucide-square')).toBeVisible();
    const stopBox = (await cardStop.boundingBox())!;
    const uptimeBox = (await uptime.boundingBox())!;
    const runningTab = (await cardControls.boundingBox())!;
    expect(uptimeBox.y + uptimeBox.height).toBeLessThan(cardBox.y);
    expect(uptimeBox.x + uptimeBox.width).toBeLessThan(stopBox.x);
    expect(runningTab.width).toBeGreaterThan(stoppedTab.width);
    expect(runningTab.height).toBeCloseTo(stoppedTab.height, 0);
    expect(runningTab.x + runningTab.width).toBeCloseTo(stoppedTab.x + stoppedTab.width, 0);
    await expect(page.getByRole('tooltip', { name: '停止', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip', { name: '停止', exact: true })).not.toBeVisible();
    await cardStop.click();
    await expect(start).toBeEnabled();
    await expect(start).toHaveCSS('border-top-color', selectedBorder);
    await expect(uptime).toHaveCount(0);
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
  await page.clock.install();
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
  const cardStart = controls.getByRole('button', { name: 'Start service', exact: true });
  const measure = () =>
    card.evaluate((node) => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height };
    });
  await expect(cardStart).toBeVisible();
  await expect(cardStart).toHaveCSS('background-color', 'rgb(170, 224, 98)');
  const stoppedSize = await measure();
  const cardExample = page.getByRole('region', { name: 'Repository card', exact: true });
  await cardExample.screenshot({ path: test.info().outputPath('card-light-en-stopped.png') });
  await card.locator('.repository-card-count.staged').focus();
  await page.keyboard.press('Tab');
  await expect(cardStart).toBeFocused();
  const startBox = (await cardStart.boundingBox())!;
  expect(startBox.y + startBox.height / 2).toBeCloseTo((await card.boundingBox())!.y, 0);
  await page.keyboard.press('Enter');
  await expect(controls.getByRole('status')).toHaveText('Running');
  const uptime = card.getByRole('timer', { name: 'Service uptime' });
  await expect(uptime).toBeVisible();
  await expect.poll(measure).toEqual(stoppedSize);
  await expect(uptime).toHaveText('00:00:00');
  await page.clock.fastForward(86399000);
  await expect(uptime).toHaveText('23:59:59');
  await page.clock.fastForward(1000);
  await expect(uptime).toHaveText('01d 00:00:00');
  await expect.poll(measure).toEqual(stoppedSize);
  await expect(controls.getByRole('button')).toHaveCount(1);
  const cardStop = controls.getByRole('button', { name: 'Stop', exact: true });
  await expect(cardStop).toBeFocused();
  await expect(cardStop).toHaveCSS('background-color', 'rgb(182, 53, 75)');
  const stopBox = (await cardStop.boundingBox())!;
  expect(stopBox).toEqual(startBox);
  await cardExample.screenshot({ path: test.info().outputPath('card-light-en.png') });
  await cardStop.press('Enter');
  await expect(cardStart).toBeFocused();
  await expect(uptime).toHaveCount(0);
  await expect.poll(measure).toEqual(stoppedSize);
  const example = page.getByRole('region', { name: 'Local service', exact: true });
  const header = example.locator('header');
  const footer = example.locator('footer');
  const exampleOpen = footer.getByRole('button', { name: 'Open service', exact: true });
  const output = example.locator('pre[aria-label="Recent output"]');
  await expect(example.getByRole('status')).toHaveText('Running');
  await expect(output).toContainText('npm run dev');
  await expect(output).toHaveCSS('background-color', 'rgb(22, 24, 27)');
  await expect(output).toHaveCSS('color', 'rgb(215, 220, 229)');
  await expect(header).toHaveCSS('background-color', 'rgb(36, 40, 46)');
  await expect(footer).toHaveCSS('background-color', 'rgb(36, 40, 46)');
  await expect(exampleOpen).toBeDisabled();
  expect((await exampleOpen.boundingBox())!.x - (await footer.boundingBox())!.x).toBeCloseTo(12, 0);
  const headerBox = (await header.boundingBox())!;
  expect(headerBox.height).toBe(45);
  expect((await footer.boundingBox())!.height).toBe(headerBox.height);
  await example.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(example.getByRole('status')).toHaveText('Stopped');
  await expect(exampleOpen).toHaveCount(0);
  await example.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(example.getByRole('status')).toHaveText('Running');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => example.evaluate((section) => section.scrollWidth - section.clientWidth))
    .toBe(0);
  await example.screenshot({ path: test.info().outputPath('terminal-light-en.png') });
});
