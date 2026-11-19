import { test, expect } from './test';
import { readFile, mkdir } from 'node:fs/promises';
import { fixture, commitFile } from '../tests/fixtures';
import type { APIRequestContext } from '@playwright/test';

async function seed(request: APIRequestContext) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const current = await (await request.get('/api/workspace', { headers })).json();
  const board = {
    id: 'chart',
    name: '发布流程',
    description: '从开始沿箭头阅读',
    nodes: [],
    edges: [],
    viewport: { x: 50, y: 90, zoom: 1 },
    notes: [
      {
        id: 'start',
        kind: 'start',
        title: '开始维护',
        summary: '',
        text: '选择公共或服务功能',
        position: { x: 0, y: 0 },
      },
      {
        id: 'check',
        kind: 'decision',
        title: '检查通过？',
        summary: '按结果分流',
        text: '执行检查，失败先修复',
        position: { x: 0, y: 180 },
      },
      {
        id: 'end',
        kind: 'end',
        title: '已交付',
        text: '独立核对发布结果',
        position: { x: 450, y: 180 },
      },
    ],
    connections: [
      {
        id: 'next',
        source: 'start',
        target: 'check',
        label: '检查',
        sourcePort: 'bottom',
        targetPort: 'top',
      },
      {
        id: 'pass',
        source: 'check',
        target: 'end',
        label: '通过',
        sourcePort: 'right',
        targetPort: 'left',
      },
      {
        id: 'retry',
        source: 'check',
        target: 'start',
        label: '失败：按问题归属回修并重新检查',
        sourcePort: 'left',
        targetPort: 'left',
        waypoints: [
          { x: -45, y: 248 },
          { x: -45, y: 32 },
        ],
      },
    ],
  };
  expect(
    (
      await request.put('/api/workspace', {
        headers,
        data: { ...current, activeBoardId: board.id, boards: [board] },
      })
    ).ok(),
  ).toBe(true);
  return {
    read: async () => (await (await request.get('/api/workspace', { headers })).json()).boards[0],
  };
}

test('流程步骤、判断及失败回路持久化；连线编辑、删除清理与撤销不影响 Git', async ({
  page,
  request,
}) => {
  const store = await seed(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('flow-step')).toHaveCount(3);
  await expect(page.locator('.process-edge-path')).toHaveCount(3);
  await expect(page.getByTestId('repository-node')).toHaveCount(0);
  await page.getByRole('button', { name: '流程连线：通过', exact: true }).click();
  const connection = page.getByRole('dialog', { name: '流程连线', exact: true });
  await connection.getByLabel('条件或动作').fill('验收通过');
  await connection.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await store.read()).connections.find((c: { id: string }) => c.id === 'pass').label,
    )
    .toBe('验收通过');
  await page.locator('.react-flow__node[data-id="check"]').focus();
  await page.keyboard.press('Enter');
  const step = page.getByRole('dialog', { name: '流程步骤详情', exact: true });
  await expect(step.getByLabel('节点形状')).toHaveValue('decision');
  await expect(step.getByLabel('说明内容')).toHaveValue('执行检查，失败先修复');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node[data-id="check"]').click();
  await page.getByRole('button', { name: '移除所选元素', exact: true }).click();
  await expect.poll(async () => (await store.read()).connections.length).toBe(0);
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect.poll(async () => (await store.read()).connections.length).toBe(3);
  await page.reload();
  await expect(page.getByTestId('flow-step')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '流程连线：验收通过', exact: true })).toBeVisible();
});

test('可拖连步骤，双主题／语言、导出形状和设计规范实例', async ({ page, request }) => {
  await seed(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: '添加流程步骤', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '流程步骤详情', exact: true });
  await dialog.getByLabel('说明标题').fill('服务验收');
  await dialog.getByLabel('图上摘要').fill('编辑、登录与保存');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('flow-step')).toHaveCount(4);
  const start = page.locator(
    '.react-flow__node[data-id="end"] .react-flow__handle.source[data-handleid="source-bottom"]',
  );
  const target = page
    .getByTestId('flow-step')
    .filter({ hasText: '服务验收' })
    .locator('..')
    .locator('.react-flow__handle.target[data-handleid="target-top"]');
  const from = (await start.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: '流程连线', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByLabel('条件或动作').fill('补充验收');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.process-edge-path')).toHaveCount(4);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByRole('combobox').selectOption('en');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('flow-step').filter({ hasText: '服务验收' })).toBeVisible();
  for (const shape of await page.locator('.flow-step-shape > *').all())
    await expect(shape).toHaveCSS('fill', 'none');
  const labelPosition = await page.locator('[data-edge-id="pass"]').evaluate((label) => {
    const rect = label.getBoundingClientRect();
    const canvas = label.closest('.react-flow')!.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(
      getComputedStyle(document.querySelector('.react-flow__viewport')!).transform,
    );
    return {
      x: (rect.x + rect.width / 2 - canvas.x - matrix.e) / matrix.a,
      y: (rect.y + rect.height / 2 - canvas.y - matrix.f) / matrix.d,
    };
  });
  await page.getByRole('button', { name: 'Export board', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  expect(svg).toContain('<polygon');
  expect(svg).toContain('检查通过？');
  expect.soft(svg).toContain('失败：按问题归属回修并重新检查');
  expect.soft(svg).not.toContain('独立核对发布结果');
  const exportedLabel = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const text = [...doc.querySelectorAll('text')].find(
      (element) => element.textContent === '通过',
    )!;
    const background = text.previousElementSibling!;
    return {
      x: Number(background.getAttribute('x')) + Number(background.getAttribute('width')) / 2,
      y: Number(text.getAttribute('y')),
    };
  }, svg);
  expect(exportedLabel.x).toBeCloseTo(labelPosition.x, 0);
  expect(exportedLabel.y).toBeCloseTo(labelPosition.y + 4, 0);
  await mkdir('.megit/verification/connected-workflow', { recursive: true });
  await page.screenshot({ path: '.megit/verification/connected-workflow/e2e-light-en.png' });
  await page.goto('/design-system');
  await expect(
    page.getByRole('heading', { name: 'Connected workflow steps', exact: true }),
  ).toBeVisible();
});

test('窄屏触控可查看判断详情', async ({ browser, request }) => {
  await seed(request);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: '适应白板', exact: true }).tap();
  await page.getByTestId('flow-step').filter({ hasText: '检查通过？' }).tap();
  await page.getByRole('button', { name: '说明详情', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '流程步骤详情', exact: true });
  await expect(dialog.getByLabel('节点形状')).toHaveValue('decision');
  await expect(dialog).toBeInViewport();
  await page.keyboard.press('Escape');
  await context.close();
});

test('流程连线可拖动两端重连，保留条件、撤销重做和刷新；无效拖动保留原线', async ({
  page,
  request,
}) => {
  const store = await seed(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const edge = page.locator('.react-flow__edge[data-id="retry"]');
  const sourcePort = page.locator(
    '.react-flow__node[data-id="check"] .react-flow__handle[data-handleid="source-left"]',
  );
  const portBefore = await sourcePort.boundingBox();
  const point = await edge.locator('.process-edge-path').evaluate((element) => {
    const path = element as SVGPathElement;
    const position = path.getPointAtLength(path.getTotalLength() * 0.2);
    const screen = position.matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const dragEnd = async (side: 'source' | 'target', node: string, port: string) => {
    await edge.focus();
    await page.keyboard.press('Enter');
    const from = (await edge.locator(`.react-flow__edgeupdater-${side}`).boundingBox())!;
    const to = (await page
      .locator(
        `.react-flow__node[data-id="${node}"] .react-flow__handle[data-handleid="${side}-${port}"]`,
      )
      .boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 18 });
    await page.mouse.up();
  };
  await expect(edge.locator('.react-flow__edgeupdater-target')).toBeVisible();
  await expect(edge.locator('.react-flow__edgeupdater-source')).toHaveCSS(
    'fill',
    'rgba(0, 0, 0, 0)',
  );
  const portAfter = await sourcePort.boundingBox();
  expect(portAfter!.width / portBefore!.width).toBeCloseTo(2, 1);
  expect(portAfter!.height / portBefore!.height).toBeCloseTo(2, 1);
  expect(portAfter!.x + portAfter!.width / 2).toBeCloseTo(portBefore!.x + portBefore!.width / 2, 0);
  expect(portAfter!.y + portAfter!.height / 2).toBeCloseTo(
    portBefore!.y + portBefore!.height / 2,
    0,
  );
  await dragEnd('target', 'end', 'top');
  await expect
    .poll(
      async () =>
        (await store.read()).connections.find((c: { id: string }) => c.id === 'retry').target,
    )
    .toBe('end');
  await dragEnd('source', 'start', 'right');
  await expect
    .poll(async () =>
      (await store.read()).connections.find((c: { id: string }) => c.id === 'retry'),
    )
    .toMatchObject({
      source: 'start',
      target: 'end',
      sourcePort: 'right',
      targetPort: 'top',
      label: '失败：按问题归属回修并重新检查',
    });
  expect(
    (await store.read()).connections.find((c: { id: string }) => c.id === 'retry').waypoints,
  ).toBeUndefined();
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await store.read()).connections.find((c: { id: string }) => c.id === 'retry').source,
    )
    .toBe('check');
  await page.getByRole('button', { name: '重做白板编辑', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await store.read()).connections.find((c: { id: string }) => c.id === 'retry').source,
    )
    .toBe('start');
  const before = (await store.read()).connections;
  await dragEnd('target', 'start', 'top');
  const handle = (await edge.locator('.react-flow__edgeupdater-target').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(1100, 700, { steps: 12 });
  await page.mouse.up();
  expect((await store.read()).connections).toEqual(before);
  await page.reload();
  await expect(page.locator('.process-edge-path')).toHaveCount(3);
  expect((await store.read()).connections).toEqual(before);
  await edge.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '锁定布局', exact: true }).click();
  await expect(edge.locator('.react-flow__edgeupdater')).toHaveCount(0);
  await page.getByRole('button', { name: '解锁布局', exact: true }).click();
  await expect(edge.locator('.react-flow__edgeupdater')).toHaveCount(2);
  await page.getByRole('button', { name: '平移', exact: true }).click();
  await expect(edge.locator('.react-flow__edgeupdater')).toHaveCount(0);
});

test('所有流程形状透明且无详情按钮，条件面板不再设置端点', async ({ page, request }) => {
  await seed(request);
  await page.goto('/');
  await expect(page.getByTestId('flow-step')).toHaveCount(3);
  for (const shape of await page.locator('.flow-step-shape > *').all())
    await expect(shape).toHaveCSS('fill', 'none');
  await expect(page.getByTestId('flow-step').getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: '流程连线：通过', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '流程连线', exact: true });
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByLabel('条件或动作')).toBeVisible();
});

test('合法长标题与摘要保留在详情，图上与导出不越出步骤形状', async ({ page, request }) => {
  await seed(request);
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const current = await (await request.get('/api/workspace', { headers })).json();
  const title = '维护流程标题'.repeat(16);
  const summary = '核对版本并逐步完成验收'.repeat(16);
  current.boards[0].notes = current.boards[0].notes.map((note: { id: string }) => ({
    ...note,
    title,
    summary,
  }));
  expect((await request.put('/api/workspace', { headers, data: current })).ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const overflow = await page.getByTestId('flow-step').evaluateAll((steps) =>
    steps.map((step) => {
      const box = step.getBoundingClientRect();
      const content = step.querySelector('.flow-step-content')!.getBoundingClientRect();
      return Math.max(box.top - content.top, content.bottom - box.bottom, 0);
    }),
  );
  expect.soft(Math.max(...overflow)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '导出白板', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  const exportedText = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const shapes = [...doc.documentElement.children].filter(
      (element) =>
        element.tagName === 'polygon' ||
        (element.tagName === 'rect' && element.getAttribute('width') === '260'),
    );
    return shapes.map((shape) => {
      const top =
        shape.tagName === 'rect'
          ? Number(shape.getAttribute('y'))
          : Math.min(
              ...shape
                .getAttribute('points')!
                .split(' ')
                .map((point) => Number(point.split(',')[1])),
            );
      const height = shape.tagName === 'rect' ? Number(shape.getAttribute('height')) : 138;
      const lines = [];
      let next = shape.nextElementSibling;
      while (next?.tagName === 'text') {
        lines.push(Number(next.getAttribute('y')));
        next = next.nextElementSibling;
      }
      return {
        count: lines.length,
        overflow: Math.max(...lines.map((y) => Math.max(top - (y - 12), y - top - height)), 0),
      };
    });
  }, svg);
  expect.soft(exportedText).toHaveLength(3);
  expect.soft(Math.max(...exportedText.map((step) => step.count))).toBeLessThanOrEqual(4);
  expect.soft(Math.max(...exportedText.map((step) => step.overflow))).toBeLessThanOrEqual(1);
  await page.locator('.react-flow__node[data-id="start"]').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '流程步骤详情', exact: true });
  await expect(dialog.getByLabel('说明标题')).toHaveValue(title);
  await expect(dialog.getByLabel('图上摘要')).toHaveValue(summary);
});

test('流程线随仓库分组折叠投影，聚焦上下游保留连接，步骤改为说明仍可读取', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const store = await seed(request);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const current = await (await request.get('/api/workspace', { headers })).json();
    current.repositories = [{ id: 'r', name: '示例仓库', path: f.repo }];
    const board = current.boards[0];
    board.nodes = [{ id: 'repo', repoId: 'r', position: { x: 500, y: 450 } }];
    board.groups = [{ id: 'group', name: '服务仓库', nodeIds: ['repo'], collapsed: true }];
    board.connections.push({
      id: 'repo-flow',
      source: 'end',
      target: 'repo',
      label: '交付到仓库',
      sourcePort: 'bottom',
      targetPort: 'top',
    });
    expect((await request.put('/api/workspace', { headers, data: current })).ok()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.process-edge-path')).toHaveCount(4);
    await expect(
      page.locator(
        '.react-flow__node[data-id="group"] .react-flow__handle[data-handleid="target-top:repo-flow"]',
      ),
    ).toHaveCount(1);
    await page.locator('.react-flow__node[data-id="check"]').click();
    await page.getByRole('button', { name: '聚焦所选上下游', exact: true }).click();
    await expect(page.locator('.process-edge-path')).toHaveCount(4);
    await page.locator('.react-flow__node[data-id="check"]').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByLabel('节点形状').selectOption('note');
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect
      .poll(
        async () => (await store.read()).notes.find((n: { id: string }) => n.id === 'check').kind,
      )
      .toBe('note');
    await expect(page.locator('.process-edge-path')).toHaveCount(4);
    await expect(
      page.locator('.react-flow__node[data-id="check"] .react-flow__handle'),
    ).toHaveCount(8);
  } finally {
    await f.cleanup();
  }
});
