import { test, expect } from './test';
import { dragConnection } from './connection-helpers';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { Board, Workspace, PortSide } from '../shared/types';

async function seed(request: APIRequestContext) {
  const f = await fixture();
  await commitFile(f.repo);
  const paths = [f.repo, path.join(f.root, 'b'), path.join(f.root, 'c')];
  for (const repo of paths.slice(1)) await git(f.root, 'clone', f.repo, repo);
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const read = async (): Promise<Workspace> =>
    (await request.get('/api/workspace', { headers })).json();
  const board: Board = {
    id: 'ports',
    name: '连接点',
    description: '',
    viewport: { x: 50, y: 100, zoom: 0.8 },
    nodes: paths.map((_, i) => ({
      id: ['a', 'b', 'c'][i],
      repoId: `r${i}`,
      position: [
        { x: 400, y: 220 },
        { x: 0, y: 0 },
        { x: 850, y: 440 },
      ][i],
    })),
    edges: [],
  };
  const save = async (next: Board) => {
    const current = await read();
    expect(
      (
        await request.put('/api/workspace', {
          headers,
          data: {
            ...current,
            activeBoardId: board.id,
            repositories: paths.map((p, i) => ({
              id: `r${i}`,
              name: ['中心仓库', '上游', '下游'][i],
              path: p,
            })),
            boards: [next],
          },
        })
      ).ok(),
    ).toBe(true);
  };
  await save(board);
  return { board, save, read, cleanup: f.cleanup };
}

async function visiblePorts(node: Locator) {
  return node.locator('.react-flow__handle').evaluateAll((handles) =>
    handles
      .filter((handle) => {
        const style = getComputedStyle(handle);
        return style.opacity !== '0' && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map((handle) => ({
        id: handle.getAttribute('data-handleid'),
        offset: (handle as HTMLElement).style.top || (handle as HTMLElement).style.left,
      })),
  );
}

async function expectAligned(page: Page, edgeId: string, handle: string, source = false) {
  await expect
    .poll(async () =>
      page.locator(`.react-flow__edge[data-id="${edgeId}"] .react-flow__edge-path`).evaluate(
        (element, options) => {
          const path = element as SVGPathElement;
          const point = path.getPointAtLength(options.source ? 0 : path.getTotalLength());
          const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
          const handle = document.querySelector(options.handle)!;
          const bounds = handle.getBoundingClientRect();
          const side = handle.getAttribute('data-handlepos');
          return Math.hypot(
            screen.x -
              (side === 'left'
                ? bounds.left
                : side === 'right'
                  ? bounds.right
                  : bounds.x + bounds.width / 2),
            screen.y -
              (side === 'top'
                ? bounds.top
                : side === 'bottom'
                  ? bounds.bottom
                  : bounds.y + bounds.height / 2),
          );
        },
        { handle, source },
      ),
    )
    .toBeLessThan(1);
}

test('仓库各边默认单点居中，同向共用；混合方向才对称分离', async ({ page, request }) => {
  const store = await seed(request);
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    const node = page.locator('.react-flow__node[data-id="a"]');
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(0);
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    expect((await visiblePorts(node)).every((p) => p.offset === '50%')).toBe(true);
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(0);
    await page.keyboard.press('Tab');
    await node.focus();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    for (const side of ['top', 'right', 'bottom', 'left'] as PortSide[]) {
      store.board.edges = ['b', 'c'].map((target) => ({
        id: `a-${target}`,
        source: 'a',
        target,
        kind: 'dependency',
        label: '',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
        sourcePort: side,
      }));
      await store.save(store.board);
      await page.reload();
      await node.hover();
      await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
      expect((await visiblePorts(node)).every((p) => p.offset === '50%')).toBe(true);
      store.board.connections = [
        { id: 'return', source: 'b', target: 'a', targetPort: side, label: '反馈' },
      ];
      await store.save(store.board);
      await page.reload();
      await node.hover();
      await expect.poll(async () => (await visiblePorts(node)).length).toBe(5);
      const ports = await visiblePorts(node);
      expect(ports.find((p) => p.id === `target-${side}`)?.offset).toBe('43%');
      expect(ports.find((p) => p.id === `source-${side}`)?.offset).toBe('57%');
      await expectAligned(
        page,
        'a-b',
        `.react-flow__node[data-id="a"] [data-handleid="source-${side}"]`,
        true,
      );
      await expectAligned(
        page,
        'return',
        `.react-flow__node[data-id="a"] [data-handleid="target-${side}"]`,
      );
      store.board.connections = [];
    }
  } finally {
    await store.cleanup();
  }
});

test('仅有入线的共享点可以发起出线，取消不分离，保存后分离且删除撤销刷新一致', async ({
  page,
  request,
}) => {
  const store = await seed(request);
  try {
    store.board.edges = [
      {
        id: 'incoming',
        source: 'b',
        target: 'a',
        kind: 'dependency',
        label: '',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
        targetPort: 'right',
      },
    ];
    await store.save(store.board);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.goto('/');
    const node = page.locator('.react-flow__node[data-id="a"]');
    const source = node.locator('[data-handleid="source-right"]');
    const target = page.locator('.react-flow__node[data-id="c"] [data-handleid="target-left"]');
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    const box = await source.boundingBox();
    if (!box) throw new Error('Missing source');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y - 70, { steps: 6 });
    await page.mouse.up();
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    await source.click();
    await target.click();
    await expect(page.getByRole('dialog', { name: '建立流程关系' })).toBeVisible();
    await page.keyboard.press('Escape');
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    await dragConnection(page, source, target);
    const dialog = page.getByRole('dialog', { name: '建立流程关系' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '保存关系', exact: true }).click();
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(5);
    await expect.poll(async () => (await store.read()).boards[0].edges.length).toBe(2);
    await expectAligned(
      page,
      'incoming',
      '.react-flow__node[data-id="a"] [data-handleid="target-right"]',
    );
    await page.reload();
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(5);
    const outgoing = (await store.read()).boards[0].edges.find((e) => e.source === 'a')!;
    await page.locator(`.edge-label[data-edge-id="${outgoing.id}"]`).click();
    await page.getByRole('button', { name: '移除所选元素', exact: true }).click();
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    await expectAligned(
      page,
      'incoming',
      '.react-flow__node[data-id="a"] [data-handleid="target-right"]',
    );
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(5);
    expect(outgoing.sourcePort).toBe('right');
    expect(outgoing.targetPort).toBe('left');
  } finally {
    await store.cleanup();
  }
});

test('真实示例支持双主题双语、单点切换与窄屏，连接点名称保留方向语义', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/design-system');
  const card = page
    .locator('section.design-card')
    .filter({ has: page.getByRole('heading', { name: '仓库连接点', exact: true }) });
  const node = card.locator('.react-flow__node[data-id="center"]');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await visiblePorts(node)).length).toBe(0);
  await node.hover();
  await expect.poll(async () => (await visiblePorts(node)).length).toBe(5);
  for (const mode of ['none', 'incoming', 'outgoing']) {
    await card.getByLabel('连接方向', { exact: true }).selectOption(mode);
    await node.hover();
    await expect.poll(async () => (await visiblePorts(node)).length).toBe(4);
    await expect(node.locator('[data-handleid="source-right"]')).toHaveAttribute(
      'aria-label',
      'MeGit · 右侧连接点（可进可出）',
    );
  }
  await card.getByLabel('连接方向', { exact: true }).selectOption('both');
  const source = node.locator('[data-handleid="source-right"]');
  const before = await source.boundingBox();
  const radius = await source.evaluate((element) => getComputedStyle(element).borderRadius);
  const line = card.locator('.react-flow__edge[data-id="out"]');
  await line.focus();
  await page.keyboard.press('Enter');
  await expect(source).toHaveClass(/is-edge-selected/);
  const after = await source.boundingBox();
  expect(after!.width / before!.width).toBeCloseTo(2, 1);
  expect(await source.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(radius);
  await mkdir('.megit/verification/repository-ports', { recursive: true });
  await card.screenshot({ path: '.megit/verification/repository-ports/dark-zh.png' });
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  const english = page.locator('section.design-card').filter({
    has: page.getByRole('heading', { name: 'Repository connection points', exact: true }),
  });
  await english.scrollIntoViewIfNeeded();
  await expect(english.locator('[data-id="center"] [data-handleid="source-right"]')).toHaveClass(
    /is-edge-selected/,
  );
  await expect(english.getByLabel('Connection direction', { exact: true })).toHaveValue('both');
  await expect(
    english.locator('[data-id="center"] [data-handleid="target-right"]'),
  ).toHaveAttribute('aria-label', 'MeGit · Right input');
  await english.screenshot({ path: '.megit/verification/repository-ports/light-en.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await english.scrollIntoViewIfNeeded();
  await expect(english.locator('.react-flow__node[data-id="upstream"]')).toBeInViewport({
    ratio: 1,
  });
  await expect(english.locator('.react-flow__node[data-id="downstream"]')).toBeInViewport({
    ratio: 1,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await english.getByLabel('Connection direction', { exact: true }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await english.screenshot({ path: '.megit/verification/repository-ports/narrow-en.png' });
  expect(errors).toEqual([]);
});
