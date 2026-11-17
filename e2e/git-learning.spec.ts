import { test, expect } from './test';
import type { Page } from '@playwright/test';

async function openLearning(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '使用帮助', exact: true }).click();
  const help = page.getByRole('dialog', { name: '认识 MeGit', exact: true });
  await help.getByRole('button', { name: '学习 Git', exact: true }).click();
  return page.getByRole('dialog', { name: 'Git 图解课堂', exact: true });
}

test('帮助右上角打开 Git 图解课堂，背景和 Escape 保持打开，主动关闭回到入口', async ({ page }) => {
  const classroom = await openLearning(page);
  await expect(classroom).toBeVisible();
  expect((await classroom.boundingBox())!.width).toBeGreaterThan(1000);
  expect((await classroom.locator('.learning-controls').boundingBox())!.height).toBeLessThan(48);
  await page.keyboard.press('Escape');
  await expect(classroom).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(classroom).toBeVisible();
  await classroom.getByRole('button', { name: '关闭 Git 图解课堂', exact: true }).click();
  await expect(classroom).toHaveCount(0);
  await expect(page.getByRole('button', { name: '学习 Git', exact: true })).toBeFocused();
});

test('暂存按快照复制，提交只记录已暂存内容，所有课程不发起 Git 或保存请求', async ({ page }) => {
  const classroom = await openLearning(page);
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      writes.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const jump = (index: number) => classroom.locator('.learning-progress button').nth(index).click();
  await jump(2);
  await expect(classroom.locator('[data-area="working"]')).toHaveAttribute('data-version', '2');
  await expect(classroom.locator('[data-area="index"]')).toHaveAttribute('data-version', '1');
  await jump(3);
  await expect(classroom.locator('[data-area="commit"]')).toHaveAttribute('data-version', '1');
  await expect(classroom.locator('[data-area="working"]')).toHaveAttribute('data-version', '2');
  await page.screenshot({
    path: '.megit/verification/git-learning/staged-dark-zh.png',
    animations: 'disabled',
  });
  for (const title of [
    '提交是快照',
    '分支与切换',
    '合并分支',
    '远端同步',
    '撤销与恢复',
    '解决冲突',
  ]) {
    await classroom.getByRole('button', { name: new RegExp(title) }).click();
    const steps = await classroom.locator('.learning-progress button').count();
    for (let index = 0; index < steps; index++) {
      await jump(index);
      await expect(classroom.locator('.learning-layout')).toHaveAttribute(
        'data-step',
        String(index),
      );
      await expect(classroom.getByRole('img')).toBeVisible();
      expect((await classroom.locator('.learning-caption').textContent())!.length).toBeLessThan(60);
    }
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('逐步演示支持播放、暂停、上一步、重播和课程切换', async ({ page }) => {
  const classroom = await openLearning(page);
  const state = classroom.locator('.learning-layout');
  await page.clock.install();
  await classroom.getByRole('button', { name: '播放演示', exact: true }).click();
  await page.clock.fastForward(2700);
  await expect(state).toHaveAttribute('data-step', '1');
  await classroom.getByRole('button', { name: '暂停演示', exact: true }).click();
  await page.clock.fastForward(6000);
  await expect(state).toHaveAttribute('data-step', '1');
  await classroom.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(state).toHaveAttribute('data-step', '0');
  await expect(classroom.getByRole('button', { name: '上一步', exact: true })).toBeDisabled();
  await classroom.locator('.learning-progress button').last().click();
  await expect(classroom.getByRole('button', { name: '本课完成', exact: true })).toBeDisabled();
  await classroom.getByRole('button', { name: '重新演示', exact: true }).click();
  await expect(state).toHaveAttribute('data-step', '0');
  await classroom.getByRole('button', { name: '播放演示', exact: true }).click();
  await classroom.getByRole('button', { name: /远端同步/ }).click();
  await page.clock.fastForward(6000);
  await expect(state).toHaveAttribute('data-lesson', 'remote');
  await expect(state).toHaveAttribute('data-step', '0');
  await expect(state).toHaveAttribute('data-playing', 'false');
  await classroom.getByRole('button', { name: '播放演示', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.fastForward(6000);
  await expect(state).toHaveAttribute('data-step', '0');
  await expect(state).toHaveAttribute('data-playing', 'false');
});

test('工作区与暂存一致时不误称与当前提交一致，独立文件合并保留各自版本', async ({ page }) => {
  const classroom = await openLearning(page);
  await classroom.locator('.learning-progress button').nth(1).click();
  await expect(classroom.locator('[data-area="working"]')).toContainText('没有未暂存修改');
  await expect(classroom.locator('[data-area="index"]')).toContainText('有待提交快照');
  await classroom.getByRole('button', { name: /撤销与恢复/ }).click();
  await expect(classroom.locator('[data-area="working"]')).toContainText('没有未暂存修改');
  await expect(classroom.locator('[data-area="commit"]')).toHaveAttribute('data-version', '2');
  await classroom.getByRole('button', { name: /合并分支/ }).click();
  await classroom.locator('.learning-progress button').last().click();
  await expect(classroom.locator('.learning-checkout [data-file="README.md"]')).toHaveAttribute(
    'data-version',
    '3',
  );
  await expect(classroom.locator('.learning-checkout [data-file="app.ts"]')).toHaveAttribute(
    'data-version',
    '2',
  );
});

test('矮屏桌面显示完整图解，小屏首个 HEAD 标签不被 SVG 裁切', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const classroom = await openLearning(page);
  for (const title of [
    '暂存与提交',
    '提交是快照',
    '分支与切换',
    '合并分支',
    '远端同步',
    '撤销与恢复',
    '解决冲突',
  ]) {
    await classroom.getByRole('button', { name: new RegExp(title) }).click();
    await classroom.locator('.learning-progress button').last().click();
    const overflow = await classroom
      .locator('.learning-diagram-scroll')
      .evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(overflow, title).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await classroom.getByRole('button', { name: /暂存与提交/ }).click();
  await classroom.locator('.learning-progress button').nth(3).click();
  const label = (await classroom.locator('[data-reference="main"]').boundingBox())!;
  const svg = (await classroom.locator('.learning-graph > svg').boundingBox())!;
  expect(label.x).toBeGreaterThanOrEqual(svg.x);
  expect(label.x + label.width).toBeLessThanOrEqual(svg.x + svg.width);
});

test('分支图显示 HEAD 与双亲合并，远端获取不移动本地 main，冲突解决后才提交', async ({ page }) => {
  const classroom = await openLearning(page);
  const jump = (index: number) => classroom.locator('.learning-progress button').nth(index).click();
  await classroom.getByRole('button', { name: /分支与切换/ }).click();
  await jump(3);
  await expect(classroom.locator('[data-reference="feature"]')).toHaveAttribute(
    'data-head',
    'true',
  );
  await expect(classroom.locator('[data-reference="main"]')).toHaveAttribute('data-target', 'C2');
  await classroom.getByRole('button', { name: /合并分支/ }).click();
  await jump(3);
  await expect(classroom.locator('[data-commit="C5"]')).toHaveAttribute('data-parents', 'C4,C3');
  await page.screenshot({
    path: '.megit/verification/git-learning/merge-dark-zh.png',
    animations: 'disabled',
  });
  await classroom.getByRole('button', { name: /远端同步/ }).click();
  await jump(2);
  await expect(classroom.locator('[data-remote-field="main"]')).toHaveAttribute('data-tip', 'C1');
  await expect(classroom.locator('[data-remote-field="tracking"]')).toHaveAttribute(
    'data-tip',
    'C2',
  );
  await page.screenshot({
    path: '.megit/verification/git-learning/fetch-dark-zh.png',
    animations: 'disabled',
  });
  await classroom.getByRole('button', { name: /解决冲突/ }).click();
  await jump(1);
  await expect(classroom.locator('[data-conflict="unresolved"]')).toBeVisible();
  await expect(classroom.locator('[data-commit="C5"]')).toHaveCount(0);
  await jump(2);
  await expect(classroom.locator('[data-conflict="resolved"]')).toBeVisible();
  await expect(classroom.locator('[data-commit="C5"]')).toHaveCount(0);
  await jump(4);
  await expect(classroom.locator('[data-commit="C5"]')).toHaveAttribute('data-parents', 'C4,C3');
  await expect(classroom.getByRole('img')).toHaveAccessibleName(
    /HEAD：main.*main → C5.*C5 → C4 \+ C3/,
  );
});

test('学习窗口可用标题拖动、键盘移动及居中，拖动和缩小视口不会丢失关闭入口', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const classroom = await openLearning(page);
  const initial = (await classroom.boundingBox())!;
  const title = (await classroom.locator('.dialog-header h2').boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 130, title.y + title.height / 2 + 65, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await classroom.boundingBox())!.x - initial.x))
    .toBe(90);
  await expect
    .poll(async () => Math.round((await classroom.boundingBox())!.y - initial.y))
    .toBe(65);
  const handle = classroom.getByRole('button', { name: /^移动窗口/ });
  await handle.focus();
  await expect(classroom.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(classroom.getByRole('tooltip')).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await classroom.boundingBox())!.x - initial.x))
    .toBe(74);
  await page.keyboard.press('Home');
  await expect.poll(async () => Math.round((await classroom.boundingBox())!.x - initial.x)).toBe(0);
  await page.keyboard.press('Shift+ArrowRight');
  await page.setViewportSize({ width: 390, height: 844 });
  const close = classroom.getByRole('button', { name: '关闭 Git 图解课堂', exact: true });
  await expect(close).toBeInViewport();
  const bounds = (await classroom.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(383);
  await close.click();
});

test('真实组件示例中的学习面板支持明亮英文、触控窄屏及减少动态，不依赖 API', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
      ),
    );
    const page = await context.newPage();
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls.push(request.url());
    });
    await page.goto('/design-system');
    await page.getByRole('button', { name: 'Open visual classroom', exact: true }).click();
    const classroom = page.getByRole('dialog', { name: 'Git visual classroom', exact: true });
    await expect(classroom).toBeVisible();
    await classroom.getByRole('button', { name: 'Stage snapshot', exact: true }).tap();
    await expect(classroom.locator('[data-area="index"]')).toHaveAttribute('data-version', '1');
    expect(
      await classroom
        .locator('.learning-diagram-scroll')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    expect(
      await classroom
        .locator('.learning-index-copy')
        .evaluate((element) => getComputedStyle(element).transitionProperty),
    ).not.toContain('transform');
    await expect(
      classroom.getByRole('button', { name: 'Close Git visual classroom', exact: true }),
    ).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await classroom.getByRole('button', { name: /Sync with a remote/ }).tap();
    await classroom.locator('.learning-progress button').nth(2).tap();
    for (const field of ['main', 'tracking', 'remote'])
      await expect(classroom.locator(`[data-remote-field="${field}"]`)).toBeInViewport();
    await page.screenshot({
      path: '.megit/verification/git-learning/mobile-light-en.png',
      animations: 'disabled',
    });
    await classroom.getByRole('button', { name: 'Close Git visual classroom', exact: true }).tap();
    expect(apiCalls).toEqual([]);
  } finally {
    await context.close();
  }
});

test('同一批次的连续指针事件也不会把窗口拖出可关闭范围', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const classroom = await openLearning(page);
  const title = (await classroom.locator('.dialog-header h2').boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + title.height / 2);
  await page.mouse.down();
  await classroom.locator('.dialog-header').evaluate((header) => {
    for (let index = 0; index < 4; index++) {
      header.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          buttons: 1,
          clientX: 1599,
          clientY: 999,
        }),
      );
    }
  });
  await page.mouse.up();
  const bounds = (await classroom.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1592);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(992);
  await expect(
    classroom.getByRole('button', { name: '关闭 Git 图解课堂', exact: true }),
  ).toBeInViewport();
});

test('触控拖动标题可移动窗口，手势取消后停止跟随', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/design-system');
    await page.getByRole('button', { name: '打开图解课堂', exact: true }).tap();
    const classroom = page.getByRole('dialog', { name: 'Git 图解课堂', exact: true });
    const initial = (await classroom.boundingBox())!;
    const title = (await classroom.locator('.dialog-header h2').boundingBox())!;
    const session = await context.newCDPSession(page);
    const x = Math.round(title.x + 40),
      y = Math.round(title.y + title.height / 2);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 75, y: y + 40, id: 1 }],
    });
    await expect
      .poll(async () => Math.round((await classroom.boundingBox())!.x - initial.x))
      .toBe(75);
    await expect
      .poll(async () => Math.round((await classroom.boundingBox())!.y - initial.y))
      .toBe(40);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.mouse.move(x + 150, y + 100);
    await expect
      .poll(async () => Math.round((await classroom.boundingBox())!.x - initial.x))
      .toBe(75);
    await classroom.getByRole('button', { name: '关闭 Git 图解课堂', exact: true }).tap();
    await session.detach();
  } finally {
    await context.close();
  }
});
