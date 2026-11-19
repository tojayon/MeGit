import { test, expect } from './test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { Workspace } from '../shared/types';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

async function seed(
  request: APIRequestContext,
  waypoints?: { x: number; y: number }[],
  zoom = 0.9,
) {
  const f = await fixture();
  await commitFile(f.repo);
  const other = path.join(f.root, 'other');
  await git(f.root, 'clone', f.repo, other);
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const read = async (): Promise<Workspace> =>
    (await request.get('/api/workspace', { headers })).json();
  const current = await read();
  expect(
    (
      await request.put('/api/workspace', {
        headers,
        data: {
          ...current,
          activeBoardId: 'routes',
          repositories: [
            { id: 'r1', name: '上游', path: f.repo },
            { id: 'r2', name: '下游', path: other },
          ],
          boards: [
            {
              id: 'routes',
              name: '路线编辑',
              description: '',
              viewport: { x: 90, y: 120, zoom },
              nodes: [
                { id: 'a', repoId: 'r1', position: { x: 30, y: 30 } },
                { id: 'b', repoId: 'r2', position: { x: 650, y: 200 } },
              ],
              edges: [
                {
                  id: 'git',
                  source: 'a',
                  target: 'b',
                  kind: 'dependency',
                  label: '仓库关系',
                  sourceRef: 'HEAD',
                  targetRef: 'HEAD',
                  waypoints,
                },
              ],
              notes: [
                {
                  id: 'start',
                  kind: 'start',
                  title: '开始',
                  text: '',
                  position: { x: 30, y: 420 },
                },
                { id: 'end', kind: 'end', title: '结束', text: '', position: { x: 650, y: 600 } },
              ],
              connections: [
                {
                  id: 'flow',
                  source: 'start',
                  target: 'end',
                  label: '流程路线',
                  sourcePort: 'right',
                  targetPort: 'left',
                  waypoints,
                },
              ],
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  return { read, cleanup: f.cleanup };
}

async function drag(page: Page, handle: Locator, delta = { x: 80, y: -60 }, cancel = false) {
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta.x, box.y + box.height / 2 + delta.y, {
    steps: 12,
  });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('流程线及 Git 关系均可拖动中间路线，一次撤销、取消、刷新和导出保持端点', async ({
  page,
  request,
}) => {
  const store = await seed(request);
  try {
    await page.setViewportSize({ width: 1800, height: 1200 });
    await page.goto('/');
    for (const id of ['flow', 'git']) {
      const edge = page.locator(`.react-flow__edge[data-id="${id}"]`);
      await edge.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: '编辑连线路线', exact: true }).click();
      const segments = page.locator(`[data-route-edge="${id}"][data-route-kind="segment"]`);
      await expect(segments.first()).toBeVisible();
      const before = (await store.read()).boards[0];
      await drag(page, segments.nth(1));
      const route = async () => {
        const b = (await store.read()).boards[0];
        return (id === 'flow' ? b.connections : b.edges)!.find((e) => e.id === id)!;
      };
      await expect.poll(async () => (await route()).waypoints?.length || 0).toBeGreaterThan(0);
      const changed = await route();
      expect(changed.source).toBe(id === 'flow' ? 'start' : 'a');
      expect(changed.target).toBe(id === 'flow' ? 'end' : 'b');
      await drag(page, segments.first(), { x: 0, y: 60 });
      await expect.poll(route).not.toEqual(changed);
      await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
      await expect.poll(route).toEqual(changed);
      await edge.focus();
      await page.keyboard.press('Enter');
      await drag(page, segments.first(), { x: 40, y: 70 }, true);
      expect(await route()).toEqual(changed);
      const active = (await segments.first().boundingBox())!;
      await page.mouse.move(active.x + active.width / 2, active.y + active.height / 2);
      await page.mouse.down();
      await page.mouse.move(active.x + 60, active.y + 60, { steps: 8 });
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      expect(await route()).toEqual(changed);
      await mkdir('.megit/verification/edge-route', { recursive: true });
      if (id === 'flow')
        await page.screenshot({ path: '.megit/verification/edge-route/dark-zh.png' });
      await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
      await expect.poll(async () => (await route()).waypoints).toBeUndefined();
      expect((await store.read()).boards[0].nodes).toEqual(before.nodes);
      await page.getByRole('button', { name: '重做白板编辑', exact: true }).click();
      await expect.poll(route).toEqual(changed);
      await page.reload();
      expect(await route()).toEqual(changed);
      if (id === 'git') {
        await page.locator('.edge-label[data-edge-id="git"]').click();
        await page
          .locator('.canvas-selection-tools')
          .getByRole('button', { name: '编辑关系', exact: true })
          .click();
        const dialog = page.getByRole('dialog', { name: '编辑流程关系', exact: true });
        await dialog.getByLabel('关系名称').fill('仓库关系更新');
        await dialog.getByRole('button', { name: '保存关系', exact: true }).click();
        await expect.poll(async () => (await route()).label).toBe('仓库关系更新');
        expect((await route()).waypoints).toEqual(changed.waypoints);
      }
    }
    await page.getByRole('button', { name: '导出白板', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
    const svg = await readFile((await (await download).path())!, 'utf8');
    expect(svg).toContain('流程路线');
    expect(svg).toContain('仓库关系');
  } finally {
    await store.cleanup();
  }
});

test('规范页复用路线编辑器及恢复自动路线', async ({ page }) => {
  await page.goto('/design-system');
  const card = page
    .locator('.design-card')
    .filter({ has: page.getByRole('heading', { name: '仓库连接点', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: '编辑连线路线', exact: true }).click();
  const point = card.locator('[data-route-kind="point"]').first();
  await point.focus();
  await page.keyboard.press('ArrowRight');
  await expect(card.getByRole('button', { name: '恢复自动路线', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: '恢复自动路线', exact: true }).click();
  await expect(card.getByRole('button', { name: '恢复自动路线', exact: true })).toBeDisabled();
});

test('两类路线共用横竖吸附，Alt 即时跳过，取消清理，开关和刷新保持', async ({ page, request }) => {
  const initial = [
    { x: 350, y: 350 },
    { x: 500, y: 450 },
    { x: 650, y: 550 },
  ];
  const store = await seed(request, initial);
  try {
    await page.setViewportSize({ width: 1800, height: 1200 });
    await page.goto('/');
    for (const id of ['flow', 'git']) {
      if (id === 'git') {
        await page.getByRole('button', { name: '偏好设置', exact: true }).click();
        await page.getByRole('button', { name: '明亮', exact: true }).click();
        await page.getByLabel('界面语言').selectOption('en');
        await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
      }
      const edge = page.locator(`.react-flow__edge[data-id="${id}"]`);
      await edge.focus();
      await page.keyboard.press('Enter');
      await page
        .getByRole('button', {
          name: id === 'flow' ? '编辑连线路线' : 'Edit connection route',
          exact: true,
        })
        .click();
      const point = page.locator(
        `[data-route-edge="${id}"][data-route-kind="point"][data-route-index="2"]`,
      );
      const guide = page.locator(`[data-route-guides="${id}"]`);
      const route = async () => {
        const board = (await store.read()).boards[0];
        return (id === 'flow' ? board.connections! : board.edges).find((e) => e.id === id)!
          .waypoints;
      };
      const begin = async () => {
        await point.hover();
        const box = (await point.boundingBox())!;
        const scale = await point.evaluate(
          (el) =>
            1 /
            new DOMMatrixReadOnly((el.closest('.edge-route-anchor') as HTMLElement).style.transform)
              .a,
        );
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 - 150 * scale + 4,
          box.y + box.height / 2 + 100 * scale - 4,
          { steps: 12 },
        );
      };
      await begin();
      await expect(guide.locator('line')).toHaveCount(2);
      expect(await route()).toEqual(initial);
      await page.keyboard.down('Alt');
      await expect(guide).toHaveCount(0);
      await page.keyboard.up('Alt');
      await expect(guide.locator('line')).toHaveCount(2);
      await mkdir('.megit/verification/edge-route-snapping', { recursive: true });
      await page.screenshot({ path: `.megit/verification/edge-route-snapping/${id}.png` });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(guide).toHaveCount(0);
      expect(await route()).toEqual(initial);
      await begin();
      await page.mouse.up();
      await expect(guide).toHaveCount(0);
      const aligned = [initial[0], { x: 350, y: 550 }, initial[2]];
      await expect.poll(route).toEqual(aligned);
      await page
        .getByRole('button', {
          name: id === 'flow' ? '撤销白板编辑' : 'Undo board edit',
          exact: true,
        })
        .click();
      await expect.poll(route).toEqual(initial);
      await edge.focus();
      await page.keyboard.press('Enter');
      const toggle = page.getByRole('button', {
        name: id === 'flow' ? '自动吸附' : 'Auto snap',
        exact: true,
      });
      await toggle.click();
      await begin();
      await expect(guide).toHaveCount(0);
      await page.mouse.up();
      await expect.poll(route).not.toEqual(initial);
      expect(await route()).not.toEqual(aligned);
      const free = await route();
      await page.reload();
      expect(await route()).toEqual(free);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
    }
  } finally {
    await store.cleanup();
  }
});

for (const zoom of [0.5, 1.2]) {
  test(`缩放 ${zoom} 时线段保持水平吸附并保存实际预览`, async ({ page, request }) => {
    const store = await seed(
      request,
      [
        { x: 350, y: 350 },
        { x: 500, y: 350 },
        { x: 500, y: 550 },
      ],
      zoom,
    );
    try {
      await page.setViewportSize({ width: 1800, height: 1200 });
      await page.goto('/');
      await page.locator('.react-flow__edge[data-id="flow"]').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: '编辑连线路线', exact: true }).click();
      const segment = page.locator(
        '[data-route-edge="flow"][data-route-kind="segment"][data-route-index="1"]',
      );
      await segment.hover();
      const box = (await segment.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 200 * zoom - 4, {
        steps: 12,
      });
      const guide = page.locator('[data-route-guides="flow"] line');
      await expect(guide).toHaveCount(1);
      await expect(guide).toHaveAttribute('y1', '550');
      await expect(guide).toHaveAttribute('y2', '550');
      expect(await guide.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
      await page.mouse.up();
      await expect(guide).toHaveCount(0);
      await expect
        .poll(async () => (await store.read()).boards[0].connections![0].waypoints)
        .toEqual([
          { x: 350, y: 550 },
          { x: 500, y: 550 },
        ]);
    } finally {
      await store.cleanup();
    }
  });
}

test('折点增删、键盘微调、恢复自动路线与锁定保护，双主题双语及窄屏', async ({ page, request }) => {
  const store = await seed(request);
  try {
    await page.setViewportSize({ width: 1800, height: 1200 });
    await page.goto('/');
    const edge = page.locator('.react-flow__edge[data-id="flow"]');
    await edge.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '编辑连线路线', exact: true }).click();
    const segment = page.locator('[data-route-edge="flow"][data-route-kind="segment"]').nth(1);
    await segment.dblclick();
    const route = async () => (await store.read()).boards[0].connections![0].waypoints;
    await expect.poll(async () => (await route())?.length || 0).toBeGreaterThan(0);
    const count = (await route())!.length;
    const point = page.locator('[data-route-edge="flow"][data-route-kind="point"]').nth(1);
    await point.focus();
    await page.keyboard.press('ArrowRight');
    const before = await route();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await route())?.length || 0).toBeLessThan(count);
    expect((await store.read()).boards[0].connections).toHaveLength(1);
    await page.getByRole('button', { name: '恢复自动路线', exact: true }).click();
    await expect.poll(route).toBeUndefined();
    expect(before?.length).toBe(count);
    await page.getByRole('button', { name: '锁定布局', exact: true }).click();
    await expect(page.locator('[data-route-edge]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '编辑连线路线', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '解锁布局', exact: true }).click();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await mkdir('.megit/verification/edge-route', { recursive: true });
    await page.screenshot({ path: '.megit/verification/edge-route/light-en.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await store.cleanup();
  }
});
