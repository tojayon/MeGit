import { test, expect } from './test';

test('局部树为无标题窄气泡，尖嘴指向数量，两端仅延伸线', async ({ page }) => {
  await page.goto('/design-system');
  const folded = page.locator('.tree-fold-count').first();
  await folded.click();
  const lens = page.getByRole('dialog', { name: '局部提交历史', exact: true });
  await expect(lens.locator('header')).toHaveCount(0);
  const count = Number((await folded.innerText()).slice(1));
  await expect(lens.locator('[data-lens-commit]')).toHaveCount(count);
  const geometry = await lens.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const tail = getComputedStyle(element, '::before');
    return {
      width: rect.width,
      height: rect.height,
      tail: tail.content,
      side: (element as HTMLElement).dataset.side,
      tipY:
        rect.top + parseFloat(getComputedStyle(element).getPropertyValue('--commit-lens-tail-top')),
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(100);
  expect(geometry.height).toBeGreaterThan(geometry.width);
  expect(geometry.tail).not.toBe('none');
  expect(['left', 'right']).toContain(geometry.side);
  const triggerBox = await folded.boundingBox();
  expect(geometry.tipY).toBeCloseTo(triggerBox!.y + triggerBox!.height / 2, 0);
  const firstMarker = await lens.locator('.tree-node').first().boundingBox();
  const line = await lens.locator('svg').boundingBox();
  expect(firstMarker!.y).toBeGreaterThan(line!.y + 20);
});

test('主地图选中的圆点与HEAD保持原形放大两倍，不出现大圆圈', async ({ page }) => {
  await page.goto('/design-system');
  const tree = page.getByRole('region', { name: '分支生长树', exact: true });
  for (const shape of ['circle', 'rect']) {
    const marker = tree.locator(`.branch-tree-drawing > svg .tree-node:has(> ${shape})`).first();
    const hash = await marker.getAttribute('data-node-commit');
    expect(hash).toBeTruthy();
    const glyph = marker.locator(shape);
    const before = await glyph.boundingBox();
    const hit = tree.locator(`button[data-commit="${hash}"]`).first();
    await hit.click();
    const after = await glyph.boundingBox();
    expect(after!.width / before!.width).toBeCloseTo(2, 1);
    expect(after!.height / before!.height).toBeCloseTo(2, 1);
    expect(
      await hit.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        outline: getComputedStyle(element).outlineStyle,
      })),
    ).toEqual({ background: 'rgba(0, 0, 0, 0)', outline: 'none' });
    await page.keyboard.press('Escape');
    expect((await glyph.boundingBox())!.width).toBeCloseTo(before!.width, 1);
  }
  await page.screenshot({ path: '.megit/verification/commit-tree-bubble/selection.png' });
});

test('数量入口紧凑透明，局部卡片仅显示图形，点击提交后才显示操作', async ({ page }) => {
  await page.goto('/design-system');
  const folded = page.locator('.tree-fold-count').first();
  await folded.hover();
  const appearance = await folded.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { background: style.backgroundColor, width: rect.width, height: rect.height };
  });
  expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
  expect(appearance.height).toBeLessThan(28);
  expect(appearance.width).toBeLessThan(40);
  await folded.click();
  const lens = page.getByRole('dialog', { name: '局部提交历史', exact: true });
  await expect(lens).toBeVisible();
  await expect(lens.locator('.commit-history-lens-detail')).toHaveCount(0);
  await expect(lens.locator('.commit-point-actions')).toHaveCount(0);
  await expect(lens.locator('code')).toHaveCount(0);
  await expect(lens.locator('.tree-node')).not.toHaveCount(0);
  expect(await lens.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(300);
  const point = lens.locator('[data-lens-commit]').nth(1).locator('button[data-commit]');
  await point.click();
  const actions = page.getByRole('dialog', { name: '提交操作', exact: true });
  await expect(actions).toBeVisible();
  await expect(lens).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actions).toHaveCount(0);
  await expect(lens).toBeVisible();
  await expect(point).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(lens).toHaveCount(0);
  await expect(folded).toBeFocused();
});

test('局部树键盘开关、外点和地图缩放关闭，内部滚动不改变主图', async ({ page }) => {
  await page.goto('/design-system');
  const tree = page.getByRole('region', { name: '分支生长树', exact: true });
  const folded = tree.locator('.tree-fold-count').first();
  await folded.focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  const lens = page.getByRole('dialog', { name: '局部提交历史', exact: true });
  await expect(lens).toBeVisible();
  await expect(lens).toBeFocused();
  const geometry = await lens.evaluate((element) => {
    const dot = element
      .querySelector('.tree-node > circle, .tree-node > rect')!
      .getBoundingClientRect();
    const hit = element
      .querySelector('[data-lens-commit] button[data-commit]')!
      .getBoundingClientRect();
    return {
      dotX: dot.left + dot.width / 2,
      dotY: dot.top + dot.height / 2,
      hitX: hit.left + hit.width / 2,
      hitY: hit.top + hit.height / 2,
    };
  });
  expect(geometry.dotX).toBeCloseTo(geometry.hitX, 0);
  expect(geometry.dotY).toBeCloseTo(geometry.hitY, 0);
  const snapshot = () =>
    tree.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
      transform: (element.querySelector('.branch-tree-drawing') as HTMLElement).style.transform,
    }));
  const before = await snapshot();
  const local = lens.getByRole('region', { name: '局部分支树', exact: true });
  const node = lens.locator('[data-lens-commit]').nth(10).locator('button[data-commit]');
  await node.click();
  await expect(node).toHaveAttribute('aria-expanded', 'true');
  const hash = await node.getAttribute('data-commit');
  await expect(page.getByRole('dialog', { name: '提交操作', exact: true })).toContainText(
    hash!.slice(0, 7),
  );
  await page.keyboard.press('Escape');
  await local.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => local.evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  await expect(lens).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await lens.focus();
  await page.keyboard.press('Escape');
  await expect(lens).toHaveCount(0);
  await expect(folded).toBeFocused();
  expect(await snapshot()).toEqual(before);

  await folded.click();
  await expect(lens).toBeVisible();
  await page.getByRole('heading', { name: '分支生长树', exact: true }).click();
  await expect(lens).toHaveCount(0);
  await folded.click();
  await expect(lens).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lens).toHaveCount(0);
  await expect(folded).toBeFocused();

  // A popup remains at screen scale even when its parent drawing is at 50%.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '缩小分支树', exact: true }).click();
  }
  await folded.click();
  await expect(lens).toBeVisible();
  expect(await folded.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    28,
  );
  expect(
    await lens
      .locator('[data-lens-commit] button[data-commit]')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: '放大分支树', exact: true }).click();
  await expect(lens).toHaveCount(0);
});

test.describe('触控局部树', () => {
  test.use({ viewport: { width: 390, height: 420 }, hasTouch: true });
  test('明亮英文触控点选逐个提交，顶层浮层完整显示', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    const folded = page.locator('.tree-fold-count').first();
    await folded.tap();
    const lens = page.getByRole('dialog', { name: 'Local commit history', exact: true });
    await expect(lens).toBeVisible();
    await folded.tap();
    await expect(lens).toHaveCount(0);
    await folded.tap();
    await expect(lens).toBeVisible();
    const points = lens.locator('[data-lens-commit] button[data-commit]');
    const selectedHash = await points.nth(4).getAttribute('data-commit');
    await points.nth(4).tap();
    await expect(points.nth(4)).toHaveAttribute('aria-expanded', 'true');
    expect(
      await lens.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 8 &&
          box.top >= 8 &&
          box.right <= innerWidth - 8 &&
          box.bottom <= innerHeight - 8
        );
      }),
    ).toBe(true);
    await page
      .getByRole('dialog', { name: 'Commit actions', exact: true })
      .getByRole('button', { name: 'New branch from this commit', exact: true })
      .tap();
    const dialog = page.getByRole('dialog', { name: 'Create branch', exact: true });
    await expect(dialog).toContainText(selectedHash!);
    await expect(dialog.getByLabel('Switch after creation', { exact: true })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await expect(lens).toHaveCount(0);
  });
});
