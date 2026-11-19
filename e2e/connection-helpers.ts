import { expect, type Locator, type Page } from '@playwright/test';

export async function dragConnection(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Missing connection handle');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (end.x - start.x) / 4, start.y + (end.y - start.y) / 4, {
    steps: 4,
  });
  await expect(target).not.toHaveCSS('pointer-events', 'none');
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}
