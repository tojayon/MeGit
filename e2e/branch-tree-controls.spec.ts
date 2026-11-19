import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { APIRequestContext, Locator } from '@playwright/test';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const { path } = await (
    await request.post('/api/repositories/inspect', { headers, data: { path: repo } })
  ).json();
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'tree', name: '地图工具演示', path }];
  workspace.boards[0].nodes = [{ id: 'node', repoId: 'tree', position: { x: 80, y: 100 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  return {
    headers,
    workspace: () => request.get('/api/workspace', { headers }).then((r) => r.json()),
  };
}

const scaleOf = (tree: Locator) =>
  tree
    .locator('.branch-tree-drawing')
    .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);

test('工具集中在地图右上角，树干按需选择且不切换代码', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'feature/search');
    await commitFile(f.repo, 'search.txt');
    await git(f.repo, 'switch', 'main');
    await seed(request, f.repo);
    let releaseTree!: () => void;
    const treePending = new Promise<void>((resolve) => {
      releaseTree = resolve;
    });
    await page.route('**/branch-tree?**', async (route) => {
      await treePending;
      await route.continue();
    });
    await page.goto('/');
    await page.getByRole('button', { name: '查看地图工具演示', exact: true }).click();
    try {
      await expect(page.getByText('正在绘制分支树', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '分支树工具', exact: true })).toHaveCount(0);
    } finally {
      releaseTree();
    }
    const tree = page.getByRole('region', { name: '分支生长树', exact: true });
    await expect(tree).toBeVisible();
    await expect(page.locator('.branch-tree-toolbar')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    const controls = page.locator('.branch-tree-graphic .branch-tree-view-controls');
    await expect(controls.getByRole('button', { name: '新建分支', exact: true })).toHaveCount(0);
    await expect(
      controls.getByRole('button', { name: '分支生长树说明', exact: true }),
    ).toBeVisible();
    const position = await controls.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const map = element.closest('.branch-tree-graphic')!.getBoundingClientRect();
      return { top: box.top - map.top, right: map.right - box.right };
    });
    expect(position.top).toBeLessThanOrEqual(12);
    expect(position.right).toBeLessThanOrEqual(12);
    await controls.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '更换比较树干', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '更换比较树干', exact: true });
    await expect(dialog).toContainText('不切换');
    await dialog.getByLabel('比较树干', { exact: true }).selectOption('refs/heads/feature/search');
    await page.keyboard.press('Escape');
    await expect(tree.getByRole('button', { name: '查看分支 main', exact: true })).toHaveClass(
      /on-trunk/,
    );
    await expect(controls.getByRole('button', { name: '分支树工具', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '更换比较树干', exact: true }).click();
    await dialog.getByLabel('比较树干', { exact: true }).selectOption('refs/heads/feature/search');
    await dialog.getByRole('button', { name: '应用视角', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      tree.getByRole('button', { name: '查看分支 feature/search', exact: true }),
    ).toHaveClass(/on-trunk/);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await tree.getByRole('button', { name: '查看分支 main', exact: true }).click();
    const details = page.getByRole('region', { name: '分支详情', exact: true });
    await expect(details).toContainText('正在此分支开发');
    await expect(details.getByRole('button', { name: '分支原始信息', exact: true })).toBeVisible();
    await expect(details).not.toContainText('refs/heads/main');
    // A delayed selection focus must not steal focus from a button the user reaches next.
    const information = details.getByRole('button', { name: '分支原始信息', exact: true });
    await information.focus();
    await expect(information).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText('提交编号与 HEAD');
    await page.keyboard.press('Escape');
    await page.screenshot({
      path: '.megit/verification/branch-tree-controls/dark-zh.png',
      animations: 'disabled',
    });
    await controls.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '筛选分支', exact: true }).click();
    const search = page.getByRole('dialog', { name: '筛选分支', exact: true });
    await search.getByRole('button', { name: 'feature/search', exact: true }).click();
    await expect(search).toHaveCount(0);
    await expect(details).toBeFocused();
    await controls.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '筛选分支', exact: true }).click();
    await search.getByRole('button', { name: 'feature/search', exact: true }).click();
    await expect(search).toHaveCount(0);
    await expect(details).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expect(
      tree.getByRole('button', { name: '查看分支 feature/search', exact: true }),
    ).toBeFocused();
  } finally {
    await f.cleanup();
  }
});

test('Ctrl滚轮与双指缩放保持鼠标锚点且不写入白板', async ({ page, request }) => {
  const f = await fixture();
  try {
    const root = await commitFile(f.repo);
    for (let i = 0; i < 6; i++) {
      await git(f.repo, 'switch', '-c', `feature/${i}`, root);
      await commitFile(f.repo, `feature-${i}.txt`);
    }
    await git(f.repo, 'switch', 'main');
    for (let i = 0; i < 9; i++) await commitFile(f.repo, 'main.txt', `main ${i}\n`);
    const store = await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看地图工具演示', exact: true }).click();
    const tree = page.getByRole('region', { name: '分支生长树', exact: true });
    await expect(tree).toBeVisible();
    await expect(page.locator('.save-state')).toHaveText('已保存');
    const workspace = await store.workspace();
    const boardTransform = await page.locator('.react-flow__viewport').getAttribute('style');
    const pageView = () =>
      page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        scale: visualViewport?.scale,
      }));
    const beforePage = await pageView();
    const box = (await tree.boundingBox())!;
    const point = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.38 };
    const worldAtPoint = () =>
      tree.locator('.branch-tree-drawing').evaluate((element, point) => {
        const rect = element.getBoundingClientRect();
        const scale = new DOMMatrix(getComputedStyle(element).transform).a;
        return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale };
      }, point);
    // Opposite wheel events in one frame can return to the same scale while moving the anchor at a scroll boundary.
    await tree.evaluate((element, point) => {
      element.scrollTop = 0;
      for (const deltaY of [40, -40])
        element.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            ctrlKey: true,
            deltaY,
          }),
        );
    }, point);
    await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => scaleOf(tree)).toBe(1);
    const burstAnchor = await worldAtPoint();
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -25);
    await page.keyboard.up('Control');
    await expect.poll(() => scaleOf(tree)).toBeGreaterThan(1);
    const afterBurst = await worldAtPoint();
    expect(Math.abs(afterBurst.x - burstAnchor.x)).toBeLessThan(2);
    expect(Math.abs(afterBurst.y - burstAnchor.y)).toBeLessThan(2);
    // Restore the original view before checking a standalone mouse / native Ctrl+wheel gesture.
    await page.getByRole('button', { name: '缩小分支树', exact: true }).click();
    const standaloneScale = await scaleOf(tree);
    const standaloneAnchor = await worldAtPoint();
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -25);
    await page.keyboard.up('Control');
    await expect.poll(() => scaleOf(tree)).toBeGreaterThan(standaloneScale);
    const anchored = await worldAtPoint();
    expect(Math.abs(anchored.x - standaloneAnchor.x)).toBeLessThan(2);
    expect(Math.abs(anchored.y - standaloneAnchor.y)).toBeLessThan(2);
    const mouseScale = await scaleOf(tree);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: point.x,
      y: point.y,
      deltaX: 0,
      deltaY: -25,
      modifiers: 2,
    });
    await expect.poll(() => scaleOf(tree)).toBeGreaterThan(mouseScale);
    expect(await pageView()).toEqual(beforePage);
    const dispatched = await tree.evaluate((element, point) => {
      const wheel = (deltaY: number, extra: WheelEventInit = {}) => {
        const event = new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          deltaY,
          ...extra,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        rapid: Array.from({ length: 12 }, () => wheel(-120, { ctrlKey: true })),
        horizontal: wheel(0, { deltaX: 60 }),
        shift: wheel(60, { shiftKey: true }),
      };
    }, point);
    expect(dispatched.rapid.every(Boolean)).toBe(true);
    expect(dispatched.horizontal).toBe(false);
    expect(dispatched.shift).toBe(true);
    await expect.poll(() => scaleOf(tree)).toBe(2);
    await tree.evaluate((element, point) => {
      for (let i = 0; i < 20; i++)
        element.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            clientX: point.x,
            clientY: point.y,
            deltaY: 120,
          }),
        );
    }, point);
    await expect.poll(() => scaleOf(tree)).toBe(0.5);
    await page.getByRole('button', { name: '放大分支树', exact: true }).click();
    const tip = tree.getByRole('button', { name: '查看分支 main', exact: true });
    await tip.click();
    const detail = page.getByRole('region', { name: '分支详情', exact: true });
    const selectedScale = await scaleOf(tree);
    await detail.dispatchEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true });
    expect(await scaleOf(tree)).toBe(selectedScale);
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(boardTransform);
    expect(await store.workspace()).toEqual(workspace);
    expect(await pageView()).toEqual(beforePage);
    await cdp.detach();
  } finally {
    await f.cleanup();
  }
});

test.describe('明亮英文触控', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('长分支详情与地图工具不溢出，原始信息按需查看', async ({ page, request }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      const name = 'feature/a-long-name-for-parallel-development';
      await git(f.repo, 'switch', '-c', name);
      await commitFile(f.repo, 'feature.txt');
      await seed(request, f.repo);
      await page.goto('/');
      await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      await page.getByRole('button', { name: '明亮', exact: true }).click();
      await page.getByLabel('界面语言').selectOption('en');
      await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
      await page.getByRole('button', { name: 'View 地图工具演示', exact: true }).click();
      const tree = page.getByRole('region', { name: 'Branch growth tree', exact: true });
      await tree.getByRole('button', { name: `View branch ${name}`, exact: true }).click();
      const details = page.getByRole('region', { name: 'Branch details', exact: true });
      await expect(details).toContainText(name);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await details.getByRole('button', { name: 'Branch information', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Branch information', exact: true }),
      ).toContainText(`refs/heads/${name}`);
      await page.keyboard.press('Escape');
      const controls = page.locator('.branch-tree-view-controls');
      const sizes = await controls.locator('button').evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
      );
      expect(sizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: '.megit/verification/branch-tree-controls/light-en-touch.png',
        animations: 'disabled',
      });
      // The compact heading leaves more map space; keep this case short enough to overflow.
      await page.setViewportSize({ width: 390, height: 420 });
      await page.locator('.dock-panels').evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      // Resize listeners dismiss anchored menus; finish that frame before opening one.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await controls.getByRole('button', { name: 'Branch tree tools', exact: true }).click();
      const menu = page.locator('.branch-tree-menu-items');
      await expect(menu).toBeVisible();
      const menuBounds = await menu.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const map = element.closest('.branch-tree-stage')!.getBoundingClientRect();
        return {
          contained: box.top >= map.top && box.bottom <= map.bottom,
          scrollable: element.scrollHeight > element.clientHeight,
        };
      });
      expect(menuBounds.contained).toBe(true);
      expect(menuBounds.scrollable).toBe(true);
      await menu.getByRole('button', { name: 'Refresh status', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(menu).toHaveCount(0);
    } finally {
      await f.cleanup();
    }
  });
});
