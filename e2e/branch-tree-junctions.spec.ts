import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

for (const continued of [false, true]) {
  for (const english of [false, true]) {
    test(`长距离合流沿独立轨道直行，只在提交附近短弯接入（${continued ? '源分支继续开发' : '普通合并'}）：${english ? '明亮英文' : '暗黑中文'}`, async ({
      page,
      request,
    }, testInfo) => {
      const f = await fixture();
      try {
        await commitFile(f.repo, 'root.txt');
        await git(f.repo, 'switch', '-c', 'feature/search');
        const feature = await commitFile(f.repo, 'feature.txt');
        await git(f.repo, 'switch', 'main');
        for (let i = 0; i < 9; i++) await commitFile(f.repo, 'main.txt', `main ${i}\n`);
        await git(f.repo, 'merge', '--no-ff', 'feature/search', '-m', 'Merge search');
        const head = await git(f.repo, 'rev-parse', 'HEAD');
        const later: string[] = [];
        if (continued) {
          await git(f.repo, 'switch', 'feature/search');
          for (let i = 0; i < 3; i++)
            later.push(await commitFile(f.repo, 'next.txt', `next ${i}\n`));
          await git(f.repo, 'switch', 'main');
        }
        const { token } = await (await request.get('/api/session')).json();
        const headers = { 'X-MeGit-Token': token };
        const workspace = await (await request.get('/api/workspace', { headers })).json();
        workspace.repositories = [{ id: 'junctions', name: 'Junction fixture', path: f.repo }];
        workspace.boards[0].nodes = [
          { id: 'node', repoId: 'junctions', position: { x: 80, y: 100 } },
        ];
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
            name: english ? 'View Junction fixture' : '查看Junction fixture',
            exact: true,
          })
          .click();
        const tree = page.locator('.branch-tree-viewport');
        const merge = tree.locator('.tree-edge[data-merge="true"]');
        await expect(merge).toHaveCount(1);
        const geometry = await tree.evaluate(
          (element, { head, feature, later }) => {
            const point = (hash: string) => {
              const el = element
                .querySelector(`[data-commit="${hash}"]`)!
                .closest<HTMLElement>('.tree-commit-anchor')!;
              return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
            };
            const source = point(head),
              target = point(feature);
            const path = element.querySelector<SVGPathElement>('.tree-edge[data-merge="true"]')!;
            const length = path.getTotalLength();
            const samples = Array.from({ length: 301 }, (_, i) =>
              path.getPointAtLength((length * i) / 300),
            );
            const middle = samples.filter((p) => p.y > source.y + 96 && p.y < target.y - 96);
            const nearby = later.map(point);
            const clearance = Math.min(
              ...samples.flatMap((p) => nearby.map((n) => Math.hypot(p.x - n.x, p.y - n.y))),
            );
            return {
              clearance,
              gap: target.y - source.y,
              samples: middle.length,
              deviation: Math.max(...middle.map((p) => Math.abs(p.x - target.x))),
              spread: Math.max(...middle.map((p) => p.x)) - Math.min(...middle.map((p) => p.x)),
              sameLane: source.x === target.x,
            };
          },
          { head, feature, later },
        );
        expect(geometry.sameLane).toBe(false);
        expect(geometry.gap).toBeGreaterThan(400);
        expect(geometry.samples).toBeGreaterThan(20);
        expect(geometry.spread).toBeLessThan(1);
        // A long connection stays off the trunk and avoids later source-branch commits.
        if (continued) {
          expect(geometry.clearance).toBeGreaterThan(16);
          expect(geometry.deviation).toBeGreaterThanOrEqual(23);
        } else expect(geometry.deviation).toBeLessThan(1);
        const curves = await tree
          .locator('.tree-edge')
          .evaluateAll((edges) => edges.map((el) => el.getAttribute('d')));
        expect(curves.some((d) => d?.includes('V'))).toBe(true);
        await page.setViewportSize({ width: 1440, height: 1700 });
        await tree.locator('.branch-tree-drawing').screenshot({
          path: testInfo.outputPath('tree.png'),
        });
        await tree.locator(`[data-commit="${head}"]`).click();
        await expect(
          page.getByRole('dialog', { name: english ? 'Commit actions' : '提交操作', exact: true }),
        ).toBeVisible();
        expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
      } finally {
        await f.cleanup();
      }
    });
  }
}
