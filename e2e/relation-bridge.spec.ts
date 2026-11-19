import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

test('仓库状态桥支持横向、纵向与斜向，主题语言切换和详情入口', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', f.repo, target);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const board = {
      id: 'bridges',
      name: '状态桥',
      description: '',
      nodes: [
        { id: 'a', repoId: 'a', position: { x: 0, y: 0 } },
        { id: 'b', repoId: 'b', position: { x: 650, y: 0 } },
      ],
      edges: [
        {
          id: 'bridge',
          source: 'a',
          target: 'b',
          kind: 'integration',
          label: '公共更新整合',
          sourceRef: 'HEAD',
          targetRef: 'HEAD',
        },
      ],
      notes: [{ id: 'n', kind: 'end', title: '结束', text: '', position: { x: 1000, y: 400 } }],
      connections: [{ id: 'flow', source: 'b', target: 'n', label: '完成' }],
    };
    for (const [name, position, expectedSource] of [
      ['horizontal', { x: 650, y: 0 }, 'source-right'],
      ['vertical', { x: 0, y: 550 }, 'source-bottom'],
      ['diagonal', { x: -600, y: 400 }, 'source-left'],
    ] as const) {
      const current = await (await request.get('/api/workspace', { headers })).json();
      expect(
        (
          await request.put('/api/workspace', {
            headers,
            data: {
              ...current,
              activeBoardId: board.id,
              repositories: [
                { id: 'a', name: 'MeWiki', path: f.repo },
                { id: 'b', name: 'MeWiki-Server', path: target },
              ],
              boards: [{ ...board, nodes: [board.nodes[0], { ...board.nodes[1], position }] }],
            },
          })
        ).ok(),
      ).toBe(true);
      await page.setViewportSize({ width: 1600, height: 1100 });
      await page.goto('/');
      const bridge = page.locator('.repository-relation-label[data-edge-id="bridge"]');
      await expect(bridge).toHaveText('已整合');
      const edge = page.locator('.react-flow__edge[data-id="bridge"]');
      await expect(edge.locator('textPath')).toHaveCount(0);
      await expect(bridge.locator('span')).toHaveCSS('font-weight', '700');
      const center = edge.locator('.workflow-edge-path');
      const rails = edge.locator('.workflow-edge-rails');
      const gap = edge.locator('.workflow-edge-gap');
      const route = (await center.getAttribute('d'))!;
      await expect(rails).toHaveAttribute('d', route);
      await expect(gap).toHaveAttribute('d', route);
      const coreWidth = await center.evaluate((element) =>
        parseFloat(getComputedStyle(element).strokeWidth),
      );
      expect(coreWidth).toBeGreaterThanOrEqual(3);
      await expect(gap).toHaveCSS('stroke-width', `${coreWidth + 2.5}px`);
      await expect(rails).toHaveCSS('stroke-width', `${coreWidth + 4.5}px`);
      const start = await edge.locator('.workflow-edge-path').evaluate((el) => {
        const point = (el as SVGPathElement).getPointAtLength(0);
        const screen = new DOMPoint(point.x, point.y).matrixTransform(
          (el as SVGPathElement).getScreenCTM()!,
        );
        return { x: screen.x, y: screen.y };
      });
      const sourceHandle = page.locator(
        `.react-flow__node[data-id="a"] [data-handleid="${expectedSource}"]`,
      );
      await expect(sourceHandle).toBeAttached();
      const handleBox = (await sourceHandle.boundingBox())!;
      const outwardX =
        expectedSource === 'source-right'
          ? handleBox.width / 2
          : expectedSource === 'source-left'
            ? -handleBox.width / 2
            : 0;
      const outwardY = expectedSource === 'source-bottom' ? handleBox.height / 2 : 0;
      expect(Math.abs(start.x - handleBox.x - handleBox.width / 2 - outwardX)).toBeLessThan(3);
      expect(Math.abs(start.y - handleBox.y - handleBox.height / 2 - outwardY)).toBeLessThan(3);
      await expect(edge.locator('.workflow-edge-path')).toHaveAttribute(
        'marker-start',
        /bridge-source/,
      );
      await expect(edge.locator('.workflow-edge-path')).toHaveAttribute(
        'marker-end',
        /bridge-target/,
      );
      await expect(page.locator('.process-edge-path')).toHaveAttribute('marker-end', /arrowclosed/);
      await bridge.focus();
      await expect(page.getByRole('tooltip')).toContainText('公共更新整合');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await bridge.locator('span').click();
      await expect(page.locator('.inspector-dock')).toContainText('公共更新整合');
      await mkdir('.megit/verification/relation-bridge', { recursive: true });
      await page.screenshot({ path: `.megit/verification/relation-bridge/${name}.png` });
    }
    await page.evaluate(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
      ),
    );
    await page.reload();
    await expect(page.locator('.repository-relation-label')).toHaveText('Integrated');
    await page.screenshot({ path: '.megit/verification/relation-bridge/light-en.png' });
    const track = page.locator('.react-flow__edge[data-id="bridge"] .workflow-edge-track');
    await page
      .locator('.react-flow__pane')
      .first()
      .hover({ position: { x: 500, y: 140 }, timeout: 5000 });
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 420);
    await page.keyboard.up('Control');
    await expect(track).toHaveAttribute('data-detail', 'compact');
    await expect(page.locator('.repository-relation-label > span')).toHaveCSS('font-weight', '700');
    await expect(track.locator('.workflow-edge-rails')).toBeHidden();
    await expect(track.locator('.workflow-edge-gap')).toBeHidden();
    await expect(track.locator('.workflow-edge-path')).toHaveCSS(
      'vector-effect',
      'non-scaling-stroke',
    );
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -420);
    await page.keyboard.up('Control');
    await expect(track.locator('.workflow-edge-rails')).toBeVisible();
    // Display-only routing must not rewrite the user's saved ports or references.
    const saved = await (await request.get('/api/workspace', { headers })).json();
    expect(saved.boards[0].edges).toEqual(board.edges);
    await page.locator('.react-flow__edge[data-id="bridge"]').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Edit connection route', exact: true }).click();
    const segment = page.locator('[data-route-edge="bridge"][data-route-kind="segment"]').nth(1);
    const bounds = (await segment.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 50, {
      steps: 10,
    });
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/workspace', { headers })).json()).boards[0].edges[0]
            .sourcePort,
      )
      .toBe('left');
    const edited = (await (await request.get('/api/workspace', { headers })).json()).boards[0]
      .edges[0];
    expect(edited.targetPort).toBe('right');
    expect(edited.waypoints.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('.repository-relation-label')).toHaveText('Integrated');
  } finally {
    await f.cleanup();
  }
});

test('规范页复用状态桥并支持状态、布局和窄屏双语', async ({ page }) => {
  await page.goto('/design-system');
  const card = page
    .locator('.design-card')
    .filter({ has: page.getByRole('heading', { name: '仓库状态桥', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.repository-relation-label')).toHaveText('已整合');
  await card.getByLabel('关系', { exact: true }).selectOption('pending');
  await expect(card.locator('.repository-relation-label')).toHaveText('待整合 2');
  await card.getByLabel('关系', { exact: true }).selectOption('unknown');
  await expect(card.locator('.repository-relation-label')).toHaveText('待核对');
  await card.getByLabel('仓库排列').selectOption('vertical');
  await card.screenshot({ path: '.megit/verification/relation-bridge/example-dark.png' });
  await page.evaluate(() =>
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
    ),
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  const english = page
    .locator('.design-card')
    .filter({ has: page.getByRole('heading', { name: 'Repository status bridge', exact: true }) });
  await english.getByLabel('Repository layout').selectOption('diagonal');
  await english.screenshot({
    path: '.megit/verification/relation-bridge/example-light-narrow.png',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
