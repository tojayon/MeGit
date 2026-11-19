import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

for (const english of [false, true]) {
  test(`点选标签、连线、提交和关闭浮层保持地图位置：${english ? '明亮英文窄屏' : '暗黑中文'}`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      for (let i = 0; i < 8; i++) await commitFile(f.repo, 'older.txt', `${i}\n`);
      const fork = await git(f.repo, 'rev-parse', 'HEAD');
      let feature = '';
      for (let i = 0; i < 6; i++) {
        await git(f.repo, 'switch', '-c', `feature/${i}`, fork);
        const hash = await commitFile(f.repo, `feature-${i}.txt`);
        if (!i) feature = hash;
      }
      await git(f.repo, 'switch', 'main');
      for (let i = 0; i < 9; i++) await commitFile(f.repo, 'recent.txt', `${i}\n`);
      const { token } = await (await request.get('/api/session')).json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      workspace.repositories = [{ id: 'stable', name: 'Stable view', path: f.repo }];
      workspace.boards[0].nodes = [{ id: 'node', repoId: 'stable', position: { x: 80, y: 100 } }];
      expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
      if (english) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() =>
          localStorage.setItem(
            'megit.preferences',
            JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
          ),
        );
      }
      await page.goto('/');
      await page
        .getByRole('button', {
          name: english ? 'View Stable view' : '查看Stable view',
          exact: true,
        })
        .click();
      const tree = page.locator('.branch-tree-viewport');
      const tip = tree.locator('[data-ref="refs/heads/feature/0"]');
      await tip.waitFor();
      const settle = () =>
        page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
      await settle();
      await tip.evaluate((el) => {
        const viewport = el.closest<HTMLElement>('.branch-tree-viewport')!;
        const rect = el.getBoundingClientRect(),
          outer = viewport.getBoundingClientRect();
        viewport.scrollTo({
          left: viewport.scrollLeft + rect.left - outer.left - viewport.clientWidth * 0.2,
          top: viewport.scrollTop + rect.top - outer.top - viewport.clientHeight * 0.25,
          behavior: 'instant',
        });
      });
      await settle();
      const state = () =>
        tree.evaluate((el) => ({
          left: el.scrollLeft,
          top: el.scrollTop,
          scale: getComputedStyle(el.querySelector('.branch-tree-drawing')!).transform,
        }));
      const original = await state();
      const board = await page.locator('.react-flow__viewport').getAttribute('style');
      const detail = page.getByRole('region', {
        name: english ? 'Branch details' : '分支详情',
        exact: true,
      });
      await tip.click();
      await expect(detail).toBeVisible();
      await settle();
      expect(await state()).toEqual(original);
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await settle();
      expect(await state()).toEqual(original);
      const edgePoint = await tree.evaluate((el, hash) => {
        const anchor = el
          .querySelector(`[data-commit="${hash}"]`)!
          .closest<HTMLElement>('.tree-commit-anchor')!;
        const x = parseFloat(anchor.style.left),
          y = parseFloat(anchor.style.top);
        const path = Array.from(el.querySelectorAll<SVGPathElement>('.tree-edge-hit')).find(
          (path) => {
            const start = path.getPointAtLength(0);
            return Math.abs(start.x - x) < 1 && Math.abs(start.y - y) < 1;
          },
        )!;
        const point = path.getPointAtLength(35).matrixTransform(path.getScreenCTM()!);
        return { x: point.x, y: point.y };
      }, feature);
      await page.mouse.click(edgePoint.x, edgePoint.y);
      await expect(detail).toBeVisible();
      await settle();
      expect(await state()).toEqual(original);
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      const commit = tree.locator(`[data-commit="${feature}"]`);
      await commit.click();
      const menu = page.getByRole('dialog', {
        name: english ? 'Commit actions' : '提交操作',
        exact: true,
      });
      await expect(menu).toBeVisible();
      await settle();
      expect(await state()).toEqual(original);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await tree.evaluate((el) => el.focus({ preventScroll: true }));
      // Click the visible part of a clipped target without Playwright revealing it first.
      await commit.evaluate((el) => {
        const viewport = el.closest<HTMLElement>('.branch-tree-viewport')!;
        viewport.scrollTop +=
          el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 18;
      });
      await settle();
      const clipped = await state();
      const viewportBox = (await tree.boundingBox())!,
        commitBox = (await commit.boundingBox())!;
      await page.mouse.click(commitBox.x + commitBox.width / 2, viewportBox.y + 8);
      await expect(menu).toBeVisible();
      await settle();
      expect(await state()).toEqual(clipped);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await settle();
      expect(await state()).toEqual(clipped);
      if (!english) {
        await git(f.repo, 'switch', '-c', 'feature/new-lane', fork);
        await commitFile(f.repo, 'new-lane.txt');
        await git(f.repo, 'switch', 'main');
        await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
        await expect(tree.locator('[data-ref="refs/heads/feature/new-lane"]')).toHaveCount(1);
        await settle();
        expect(await state()).toEqual(clipped);
      }
      await page
        .getByRole('button', { name: english ? 'Center on trunk' : '居中查看树干', exact: true })
        .click();
      await settle();
      expect(await state()).not.toEqual(clipped);
      expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(board);
      expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
      await page.screenshot({ path: test.info().outputPath('stable-view.png') });
    } finally {
      await f.cleanup();
    }
  });
}
