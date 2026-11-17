import { test, expect } from './test';

async function openExamples(page: import('@playwright/test').Page) {
  await page.goto('/design-system');
  const examples = page.getByRole('region', { name: '功能演示提示', exact: true });
  await expect(examples).toBeVisible();
  return examples;
}

test('动画 tooltip 延迟悬停打开，播放一次停在结果，关闭后卸载并可从头再看', async ({ page }) => {
  const examples = await openExamples(page);
  const action = examples.getByRole('button', { name: '暂存', exact: true });
  await action.scrollIntoViewIfNeeded();
  await page.clock.install();
  await action.hover();
  await page.clock.fastForward(300);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.clock.fastForward(250);
  const hint = page.getByRole('tooltip');
  const preview = hint.locator('[data-learning-demo="stage"]');
  await expect(preview).toHaveAttribute('data-frame', 'init');
  await page.clock.fastForward(1500);
  await expect(preview).toHaveAttribute('data-frame', 'stageCopy');
  await expect(preview).toHaveAttribute('data-playing', 'false');
  await page.screenshot({
    path: '.megit/verification/git-learning-media/dark-zh-desktop.png',
    animations: 'disabled',
  });
  await page.clock.fastForward(15000);
  await expect(preview).toHaveAttribute('data-frame', 'stageCopy');
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await action.focus();
  await expect(page.getByRole('tooltip').locator('[data-learning-demo="stage"]')).toHaveAttribute(
    'data-frame',
    'init',
  );
  await action.click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(examples.locator('[data-demo-activations]')).toContainText('1');
});

test('键盘聚焦的自动滚动不会误关提示，后续主动滚动仍关闭', async ({ page }) => {
  const examples = await openExamples(page);
  const action = examples.getByRole('button', { name: '暂存', exact: true });
  await action.focus();
  const hint = page.getByRole('tooltip');
  await expect(hint).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(hint).toBeVisible();
  await page.locator('.design-system-page').evaluate((element) => {
    element.scrollTop += 20;
  });
  await expect(hint).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(examples.getByRole('button', { name: '示例图标按钮', exact: true })).toBeFocused();
  await expect(hint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
});

test('语义操作可切换，单个图标提示复用远端素材，激活不会残留延迟提示', async ({ page }) => {
  const examples = await openExamples(page);
  await examples.getByLabel('演示操作', { exact: true }).selectOption('fetch');
  const action = examples.getByRole('button', { name: '示例图标按钮', exact: true });
  await action.focus();
  const hint = page.getByRole('tooltip');
  await expect(hint).toHaveCount(1);
  await expect(hint.locator('[data-learning-demo="fetch"]')).toHaveAttribute(
    'data-frame',
    'peerCommit',
  );
  await expect(hint.getByRole('button')).toHaveCount(0);
  await page.clock.install();
  await page.clock.fastForward(1500);
  await expect(hint.locator('[data-remote-field="main"]')).toHaveAttribute('data-tip', 'C1');
  await expect(hint.locator('[data-remote-field="tracking"]')).toHaveAttribute('data-tip', 'C2');
  await action.click();
  await page.clock.fastForward(5000);
  await expect(hint).toHaveCount(0);
});

test('静态图解与减少动态直接呈现结果，明亮英文窄屏图形不溢出且不调用 API', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) requests.push(request.url());
    });
    await page.goto('/design-system');
    const examples = page.getByRole('region', { name: 'Visual action hints', exact: true });
    const poster = examples.locator('[data-demo-poster] [data-learning-demo]');
    await expect(poster).toHaveAttribute('data-frame', 'stageCopy');
    await expect(poster).toHaveAttribute('data-playing', 'false');
    await examples.getByLabel('Demo action', { exact: true }).selectOption('merge');
    const action = examples.getByRole('button', { name: 'Merge', exact: true });
    await action.scrollIntoViewIfNeeded();
    await action.focus();
    const hint = page.getByRole('tooltip');
    await expect(hint.locator('[data-learning-demo="merge"]')).toHaveAttribute(
      'data-frame',
      'mergeParents',
    );
    await expect(hint.locator('[data-learning-demo="merge"]')).toHaveAttribute(
      'data-playing',
      'false',
    );
    const box = (await hint.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(382);
    expect(await hint.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: '.megit/verification/git-learning-media/light-en-mobile.png',
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(hint).toHaveCount(0);
    expect(requests).toEqual([]);
  } finally {
    await context.close();
  }
});

test('移入演示可继续观看，外点和失焦关闭，等待期间离开不会延迟弹出', async ({ page }) => {
  const examples = await openExamples(page);
  const action = examples.getByRole('button', { name: '暂存', exact: true });
  await action.hover();
  const hint = page.getByRole('tooltip');
  await expect(hint).toBeVisible();
  await hint.hover();
  await expect(hint).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(hint).toHaveCount(0);
  await action.focus();
  await expect(hint).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(hint).toHaveCount(0);
  await page.clock.install();
  await action.hover();
  await page.mouse.move(2, 2);
  await page.clock.fastForward(2000);
  await expect(hint).toHaveCount(0);
});
