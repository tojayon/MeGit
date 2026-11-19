import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

for (const english of [false, true]) {
  test(`分支地图普通滚轮滚动、Ctrl缩放、Shift横移与右键拖动：${english ? '明亮英文' : '暗黑中文'}`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      const root = await commitFile(f.repo);
      for (let i = 0; i < 6; i++) {
        await git(f.repo, 'switch', '-c', `feature/${i}`, root);
        await commitFile(f.repo, `branch-${i}.txt`);
      }
      await git(f.repo, 'switch', 'main');
      for (let i = 0; i < 9; i++) await commitFile(f.repo, 'main.txt', `${i}\n`);
      const { token } = await (await request.get('/api/session')).json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      workspace.repositories = [{ id: 'gestures', name: 'Gesture fixture', path: f.repo }];
      workspace.boards[0].nodes = [{ id: 'node', repoId: 'gestures', position: { x: 80, y: 100 } }];
      expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
      if (english)
        await page.addInitScript(() =>
          localStorage.setItem(
            'megit.preferences',
            JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
          ),
        );
      await page.goto('/');
      await page
        .getByRole('button', {
          name: english ? 'View Gesture fixture' : '查看Gesture fixture',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: english ? 'Branch tree tools' : '分支树工具', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: english ? 'Expand consecutive commits' : '展开连续提交',
          exact: true,
        })
        .click();
      const tree = page.locator('.branch-tree-viewport');
      await expect(page.locator('.save-state')).toHaveText(english ? 'Saved' : '已保存');
      const board = await page.locator('.react-flow__viewport').getAttribute('style');
      const before = await (await request.get('/api/workspace', { headers })).json();
      const scale = () =>
        tree
          .locator('.branch-tree-drawing')
          .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
      const position = () => tree.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
      await tree.evaluate((el) => el.scrollTo({ left: 0, top: 50, behavior: 'instant' }));
      const box = (await tree.boundingBox())!;
      const point = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, 100);
      await expect.poll(async () => (await position()).y).toBeGreaterThan(100);
      expect(await scale()).toBe(1);
      const vertical = (await position()).y;
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 120);
      await page.keyboard.up('Shift');
      await expect.poll(async () => (await position()).x).toBeGreaterThan(80);
      expect((await position()).y).toBeCloseTo(vertical, 0);
      expect(await scale()).toBe(1);
      const pageScale = await page.evaluate(() => ({
        width: innerWidth,
        scale: visualViewport?.scale,
        dpr: devicePixelRatio,
      }));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: point.x,
        y: point.y,
        deltaX: 0,
        deltaY: -25,
        modifiers: 2,
      });
      await expect.poll(scale).toBeGreaterThan(1);
      expect(
        await page.evaluate(() => ({
          width: innerWidth,
          scale: visualViewport?.scale,
          dpr: devicePixelRatio,
        })),
      ).toEqual(pageScale);
      const zoomed = await scale();
      await tree.evaluate((el) => el.scrollTo({ left: 100, top: 150, behavior: 'instant' }));
      await page.mouse.move(point.x, point.y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(point.x - 40, point.y - 50, { steps: 4 });
      await page.mouse.up({ button: 'right' });
      await expect.poll(async () => (await position()).x).toBeCloseTo(140, 0);
      await expect.poll(async () => (await position()).y).toBeCloseTo(200, 0);
      expect(await scale()).toBe(zoomed);
      await expect(tree).not.toHaveClass(/panning/);
      await expect(page.locator('.branch-tree-selection')).toHaveCount(0);
      await page.mouse.down({ button: 'right' });
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(tree).not.toHaveClass(/panning/);
      const stopped = await position();
      await page.mouse.move(point.x - 65, point.y - 75);
      await page.mouse.up({ button: 'right' });
      expect(await position()).toEqual(stopped);
      expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(board);
      expect(await (await request.get('/api/workspace', { headers })).json()).toEqual(before);
      await cdp.detach();
    } finally {
      await f.cleanup();
    }
  });
}
