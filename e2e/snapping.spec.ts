import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { Board, Workspace } from '../shared/types';
import { fixture, git } from '../tests/fixtures';
import path from 'node:path';
import { test, expect } from './test';

async function readWorkspace(request: APIRequestContext): Promise<Workspace> {
  const { token } = await (await request.get('/api/session')).json();
  return (await request.get('/api/workspace', { headers: { 'X-MeGit-Token': token } })).json();
}

async function seed(request: APIRequestContext, zoom = 1, patch: Partial<Board> = {}) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.boards[0].viewport = { x: 0, y: 0, zoom };
  workspace.boards[0].notes = [
    { id: 'a', title: '对齐目标', text: '临时测试说明', position: { x: 180, y: 140 } },
    { id: 'b', title: '移动对象', text: '临时测试说明', position: { x: 580, y: 340 } },
  ];
  Object.assign(workspace.boards[0], patch);
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function beginDrag(page: Page, target: Locator, offset = { x: 70, y: 45 }) {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  const start = { x: box.x + offset.x, y: box.y + offset.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Cross React Flow's drag threshold before measuring the intended movement.
  await page.mouse.move(start.x + 2, start.y);
  return { x: start.x + 2, y: start.y };
}

async function position(target: Locator) {
  return target.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f };
  });
}

async function expectFullyPainted(tooltip: Locator) {
  await expect(tooltip).toBeVisible();
  await expect
    .poll(() =>
      tooltip.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const previous = (element as HTMLElement).style.pointerEvents;
        (element as HTMLElement).style.pointerEvents = 'auto';
        const points = [
          [4, 4],
          [rect.width / 2, rect.height / 2],
          [rect.width - 4, rect.height - 4],
        ];
        const painted = points.every(([x, y]) => {
          const hit = document.elementFromPoint(rect.left + x, rect.top + y);
          return hit === element || (hit !== null && element.contains(hit));
        });
        (element as HTMLElement).style.pointerEvents = previous;
        return (
          painted &&
          rect.left >= 7 &&
          rect.top >= 7 &&
          rect.right <= innerWidth - 7 &&
          rect.bottom <= innerHeight - 7
        );
      }),
    )
    .toBe(true);
}

test('左上工具栏提示跨越导航边界时仍完整可见，暗黑中文与明亮英文', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '选择', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('按住 Shift 拖动');
  await expectFullyPainted(page.getByRole('tooltip'));
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Hold Shift while dragging');
  await expectFullyPainted(page.getByRole('tooltip'));
  await page.screenshot({
    path: '.megit/verification/snapping/tooltip-light-en.png',
    animations: 'disabled',
  });
});

test('提示在窄屏边缘避让，模态内的提示显示在顶层', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '选择', exact: true }).focus();
  await expectFullyPainted(page.getByRole('tooltip'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '添加仓库', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('仓库路径', { exact: true }).focus();
  await dialog.getByRole('button', { name: '关闭添加本地仓库', exact: true }).focus();
  await expectFullyPainted(page.getByRole('tooltip'));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('设计规范中的真实提示越过裁切容器，Escape 与滚动均可收起', async ({ page }) => {
  await page.goto('/design-system');
  const trigger = page.getByRole('button', {
    name: '提示完整显示在容器外，并避让窗口边缘。',
    exact: true,
  });
  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await expectFullyPainted(tooltip);
  const clip = (await page.locator('.design-tooltip-clip').boundingBox())!;
  const hint = (await tooltip.boundingBox())!;
  expect(hint.y + hint.height).toBeGreaterThan(clip.y + clip.height);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await trigger.focus();
  await expectFullyPainted(tooltip);
  // Keep controls scrolling under the pointer from opening a different tooltip.
  await page.mouse.move(20, 20);
  await page.mouse.wheel(0, 100);
  await expect(tooltip).toHaveCount(0);
});

test('拖动临近水平边缘时精确吸附，参考线随结束清除，撤销重做各一步', async ({ page, request }) => {
  await seed(request);
  await page.goto('/');
  const moving = node(page, 'b');
  const start = await beginDrag(page, moving);
  await page.mouse.move(start.x + 25, start.y - 196, { steps: 8 });
  await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
  await page.mouse.up();
  await expect(moving).toHaveAttribute('style', /translate\(605px, 140px\)/);
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect(moving).toHaveAttribute('style', /translate\(580px, 340px\)/);
  await page.getByRole('button', { name: '重做白板编辑', exact: true }).click();
  await expect(moving).toHaveAttribute('style', /translate\(605px, 140px\)/);
});

test('吸附开关只保存浏览器偏好，关闭后自由移动，刷新仍保持关闭', async ({ page, request }) => {
  await seed(request);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '自动吸附', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const before = await readWorkspace(request);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
  expect(await readWorkspace(request)).toEqual(before);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('megit.preferences')!).snappingEnabled,
    ),
  ).toBe(false);
  const start = await beginDrag(page, node(page, 'b'));
  await page.mouse.move(start.x + 25, start.y - 196, { steps: 8 });
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 605, y: 144 });
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
    .toEqual({ x: 605, y: 144 });
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 605, y: 144 });
});

test('按下和松开 Alt 即时切换吸附，松手以实际预览保存', async ({ page, request }) => {
  await seed(request);
  await page.goto('/');
  const moving = node(page, 'b');
  const start = await beginDrag(page, moving);
  await page.mouse.move(start.x + 25, start.y - 196, { steps: 8 });
  await expect.poll(() => position(moving)).toEqual({ x: 605, y: 140 });
  await page.keyboard.down('Alt');
  await expect.poll(() => position(moving)).toEqual({ x: 605, y: 144 });
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await page.keyboard.up('Alt');
  await expect.poll(() => position(moving)).toEqual({ x: 605, y: 140 });
  await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
  await page.keyboard.down('Alt');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
    .toEqual({ x: 605, y: 144 });
  await expect(page.getByRole('button', { name: '自动吸附', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.snap-guides')).toHaveCount(0);
});

test('按住 Shift 拖动锁定主轴，吸附不改变另一轴，松开按键立即恢复', async ({
  page,
  request,
}) => {
  await seed(request, 1, {
    notes: [
      { id: 'a', title: '对齐目标', text: '', position: { x: 700, y: 344 } },
      { id: 'b', title: '移动对象', text: '', position: { x: 580, y: 340 } },
    ],
  });
  await page.goto('/');
  const moving = node(page, 'b');
  await page.keyboard.down('Shift');
  const start = await beginDrag(page, moving);
  await page.mouse.move(start.x + 1, start.y + 2);
  await expect.poll(() => position(moving)).toEqual({ x: 580, y: 340 });
  await page.mouse.move(start.x + 116, start.y + 20, { steps: 8 });
  await expect.poll(() => position(moving)).toEqual({ x: 700, y: 340 });
  await expect(page.locator('.snap-guides line')).toHaveCount(1);
  await page.mouse.move(start.x + 116, start.y - 145, { steps: 8 });
  await expect.poll(() => position(moving)).toEqual({ x: 700, y: 340 });
  await page.keyboard.down('Alt');
  await expect.poll(() => position(moving)).toEqual({ x: 696, y: 340 });
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await page.keyboard.up('Shift');
  await expect.poll(() => position(moving)).toEqual({ x: 696, y: 195 });
  await page.keyboard.down('Shift');
  await expect.poll(() => position(moving)).toEqual({ x: 580, y: 195 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
    .toEqual({ x: 580, y: 195 });
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect.poll(() => position(moving)).toEqual({ x: 580, y: 340 });
});

test('指针停在白板边缘自动平移时仍可切换 Shift 锁轴', async ({ page, request }) => {
  await seed(request, 1, {
    notes: [{ id: 'b', title: '移动对象', text: '', position: { x: 580, y: 340 } }],
  });
  await page.goto('/');
  const moving = node(page, 'b');
  const start = await beginDrag(page, moving);
  const canvas = (await page.getByRole('application', { name: '开发流程白板' }).boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width - 18, start.y + 40, { steps: 8 });
  await expect.poll(async () => (await position(moving)).y).toBe(380);
  const beforeLock = await position(moving);
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await position(moving)).x).toBeGreaterThan(beforeLock.x + 25);
  await expect.poll(async () => (await position(moving)).y).toBe(340);
  const beforeUnlock = await position(moving);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await position(moving)).x).toBeGreaterThan(beforeUnlock.x + 25);
  await expect.poll(async () => (await position(moving)).y).toBe(380);
  await page.mouse.up();
});

test('Escape 取消正在吸附的拖动并回到原位，不创建历史，下一次拖动可正常保存', async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto('/');
  const moving = node(page, 'b');
  const start = await beginDrag(page, moving);
  await page.mouse.move(start.x + 25, start.y - 196, { steps: 8 });
  await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await expect.poll(() => position(moving)).toEqual({ x: 580, y: 340 });
  await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
  const next = await beginDrag(page, moving);
  await page.mouse.move(next.x + 25, next.y - 196, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
    .toEqual({ x: 605, y: 140 });
});

for (const zoom of [0.5, 1.6]) {
  test(`缩放 ${zoom} 时用屏幕距离吸附，参考线跟随视角，保存后刷新位置精确`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await seed(request, zoom);
    await page.goto('/');
    await expect(page.locator('.canvas-zoom-label')).toHaveText(`${zoom * 100}%`);
    const moving = node(page, 'b');
    const start = await beginDrag(page, moving, { x: 70 * zoom, y: 45 * zoom });
    await page.mouse.move(start.x + 20 * zoom, start.y - 200 * zoom + 4, { steps: 8 });
    await expect.poll(() => position(moving)).toEqual({ x: 600, y: 140 });
    const guides = page.locator('.snap-guides');
    await expect(guides.locator('line')).not.toHaveCount(0);
    const viewport = await page
      .locator('.react-flow__viewport')
      .evaluate((element) => getComputedStyle(element).transform);
    const guideTransform = await guides
      .locator(':scope > g')
      .evaluate((element) => getComputedStyle(element).transform);
    expect(guideTransform).toBe(viewport);
    await page.screenshot({
      path: `.megit/verification/snapping/aligned-${zoom}.png`,
      animations: 'disabled',
    });
    await page.mouse.up();
    await expect(guides).toHaveCount(0);
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
      .toEqual({ x: 600, y: 140 });
    await page.reload();
    await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 600, y: 140 });
  });
}

test('多选按整体外框吸附，保持相对位置，整次移动只需一步撤销', async ({ page, request }) => {
  await seed(request, 1, {
    notes: [
      { id: 'a', title: '目标', text: '', position: { x: 40, y: 160 } },
      { id: 'b', title: '左', text: '', position: { x: 460, y: 360 } },
      { id: 'c', title: '右', text: '', position: { x: 780, y: 400 } },
    ],
  });
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  const b = (await node(page, 'b').boundingBox())!;
  const c = (await node(page, 'c').boundingBox())!;
  await page.mouse.move(b.x - 12, b.y - 12);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width + 12, c.y + c.height + 12, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.selection-count')).toHaveText('已选 2 项');
  const selection = page.locator('.react-flow__nodesselection-rect');
  const start = await beginDrag(page, selection, { x: 20, y: 20 });
  await page.mouse.move(start.x + 15, start.y - 196, { steps: 8 });
  await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 475, y: 160 });
  await expect.poll(() => position(node(page, 'c'))).toEqual({ x: 795, y: 200 });
  await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
  await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 460, y: 360 });
  await expect.poll(() => position(node(page, 'c'))).toEqual({ x: 780, y: 400 });
  await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
});

test('缩放后的多选框可用 Shift 整体纵移并保持相对位置', async ({ page, request }) => {
  await seed(request, 0.8, {
    notes: [
      { id: 'b', title: '左', text: '', position: { x: 460, y: 360 } },
      { id: 'c', title: '右', text: '', position: { x: 780, y: 400 } },
    ],
  });
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  const b = (await node(page, 'b').boundingBox())!;
  const c = (await node(page, 'c').boundingBox())!;
  await page.mouse.move(b.x - 12, b.y - 12);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width + 12, c.y + c.height + 12, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.selection-count')).toHaveText('已选 2 项');
  await page.keyboard.down('Shift');
  const start = await beginDrag(page, page.locator('.react-flow__nodesselection-rect'), {
    x: 20,
    y: 20,
  });
  await page.mouse.move(start.x + 32, start.y - 80, { steps: 8 });
  await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 460, y: 260 });
  await expect.poll(() => position(node(page, 'c'))).toEqual({ x: 780, y: 300 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => (await readWorkspace(request)).boards[0].notes!.map((note) => note.position))
    .toEqual([{ x: 460, y: 260 }, { x: 780, y: 300 }]);
});

test('横向等间距吸附显示两段参考线；明亮英文和窄屏开关可访问', async ({ page, request }) => {
  await seed(request, 1, {
    notes: [
      { id: 'a', title: '起点', text: '', position: { x: 50, y: 240 } },
      { id: 'b', title: '中间', text: '', position: { x: 450, y: 440 } },
      { id: 'c', title: '终点', text: '', position: { x: 850, y: 240 } },
    ],
  });
  await page.setViewportSize({ width: 1520, height: 980 });
  await page.goto('/');
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  const moving = node(page, 'b');
  const start = await beginDrag(page, moving);
  await page.mouse.move(start.x + 4, start.y - 196, { steps: 8 });
  await expect.poll(() => position(moving)).toEqual({ x: 450, y: 240 });
  await expect(page.locator('.snap-guides path')).toHaveCount(2);
  await page.screenshot({
    path: '.megit/verification/snapping/equal-spacing-light-en.png',
    animations: 'disabled',
  });
  await page.mouse.up();
  await expect(page.locator('.snap-guides')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole('button', { name: 'Auto snap', exact: true });
  await expect(toggle).toBeInViewport();
  await toggle.focus();
  await expectFullyPainted(page.getByRole('tooltip'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const collapsed of [true, false]) {
  test(`${collapsed ? '折叠' : '展开'}分组以外框吸附和 Shift 锁轴，锁定布局后禁止拖动`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      const second = path.join(f.root, 'second');
      await git(f.root, 'clone', f.repo, second);
      const current = await readWorkspace(request);
      current.repositories = [
        { id: 'r1', name: '虚构仓库一', path: f.repo },
        { id: 'r2', name: '虚构仓库二', path: second },
      ];
      const { token } = await (await request.get('/api/session')).json();
      expect(
        (
          await request.put('/api/workspace', {
            headers: { 'X-MeGit-Token': token },
            data: current,
          })
        ).ok(),
      ).toBe(true);
      await seed(request, 1, {
        nodes: [
          { id: 'r-a', repoId: 'r1', position: { x: 500, y: 400 } },
          { id: 'r-b', repoId: 'r2', position: { x: 820, y: 440 } },
        ],
        groups: [{ id: 'g', name: '移动组', nodeIds: ['r-a', 'r-b'], collapsed }],
        notes: [{ id: 'a', title: '外框目标', text: '', position: { x: 80, y: 180 } }],
      });
      await page.setViewportSize({ width: 1520, height: 980 });
      await page.goto('/');
      const moving = node(page, 'g');
      const start = await beginDrag(page, moving, { x: 75, y: 22 });
      await page.mouse.move(start.x + 20, start.y - 160, { steps: 8 });
      await expect.poll(() => position(moving)).toEqual({ x: 496, y: 180 });
      await page.mouse.up();
      await expect
        .poll(async () => (await readWorkspace(request)).boards[0].nodes.map((n) => n.position))
        .toEqual([
          { x: 520, y: 236 },
          { x: 840, y: 276 },
        ]);
      await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
      await expect.poll(() => position(moving)).toEqual({ x: 476, y: 344 });

      await page.keyboard.down('Shift');
      const constrained = await beginDrag(page, moving, { x: 75, y: 22 });
      await page.mouse.move(constrained.x + 20, constrained.y - 160, { steps: 8 });
      await expect.poll(() => position(moving)).toEqual({ x: 476, y: 180 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect
        .poll(async () => (await readWorkspace(request)).boards[0].nodes.map((n) => n.position))
        .toEqual([{ x: 500, y: 236 }, { x: 820, y: 276 }]);
      await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
      await expect.poll(() => position(moving)).toEqual({ x: 476, y: 344 });

      await page.getByRole('button', { name: '锁定布局', exact: true }).click();
      const lockedStart = await beginDrag(page, moving, { x: 75, y: 22 });
      await page.mouse.move(lockedStart.x + 30, lockedStart.y - 160, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => position(moving)).toEqual({ x: 476, y: 344 });
      await expect(page.locator('.snap-guides')).toHaveCount(0);
    } finally {
      await f.cleanup();
    }
  });
}

test('多选框的触摸拖动被双指取消后保留选择，再次拖动可吸附和保存', async ({ browser, request }) => {
  await seed(request, 1, {
    notes: [
      { id: 'a', title: '目标', text: '', position: { x: 40, y: 160 } },
      { id: 'b', title: '左', text: '', position: { x: 460, y: 360 } },
      { id: 'c', title: '右', text: '', position: { x: 780, y: 400 } },
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1520, height: 980 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const b = (await node(page, 'b').boundingBox())!;
    const c = (await node(page, 'c').boundingBox())!;
    await page.mouse.move(b.x - 12, b.y - 12);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width + 12, c.y + c.height + 12, { steps: 8 });
    await page.mouse.up();
    const selection = page.locator('.react-flow__nodesselection-rect');
    await expect(selection).toBeFocused();
    const client = await context.newCDPSession(page);
    const touchDrag = async () => {
      await expect(selection).toBeVisible();
      const box = (await selection.boundingBox())!;
      const start = { id: 1, x: box.x + 20, y: box.y + 20 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...start, x: start.x + 20 }],
      });
      const end = { ...start, x: start.x + 35, y: start.y - 196 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      return end;
    };
    const end = await touchDrag();
    await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
    const second = { id: 2, x: 120, y: end.y + 30 };
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [end, second],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...end, x: end.x + 1 }, second],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.snap-guides')).toHaveCount(0);
    await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 460, y: 360 });
    await expect(page.locator('.selection-count')).toHaveText('已选 2 项');
    await expect(node(page, 'b')).toHaveClass(/\bdraggable\b/);
    await touchDrag();
    await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () =>
        (await readWorkspace(request)).boards[0].notes!.slice(1).map((n) => n.position.y),
      )
      .toEqual([160, 200]);
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect.poll(() => position(node(page, 'b'))).toEqual({ x: 460, y: 360 });
    await expect.poll(() => position(node(page, 'c'))).toEqual({ x: 780, y: 400 });
  } finally {
    await context.close();
  }
});

test('触控拖动被第二根手指打断时回滚并清除参考线，之后仍能正常拖动', async ({
  browser,
  request,
}) => {
  await seed(request);
  const context = await browser.newContext({
    viewport: { width: 1520, height: 980 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const moving = node(page, 'b');
    await expect(moving).toBeVisible();
    const box = (await moving.boundingBox())!;
    const client = await context.newCDPSession(page);
    const touch = { id: 1, x: box.x + 70, y: box.y + 45 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...touch, x: touch.x + 20 }],
    });
    const end = { ...touch, x: touch.x + 45, y: touch.y - 196 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
    await expect.poll(() => position(moving)).toEqual({ x: 605, y: 140 });
    const second = { id: 2, x: 120, y: end.y + 30 };
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [end, second],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...end, x: end.x + 1 }, second],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.snap-guides')).toHaveCount(0);
    await expect.poll(() => position(moving)).toEqual({ x: 580, y: 340 });
    await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeDisabled();
    expect((await readWorkspace(request)).boards[0].notes![1].position).toEqual({ x: 580, y: 340 });
    await expect(moving).toHaveClass(/\bdraggable\b/);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...touch, x: touch.x + 20 }],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await expect(page.locator('.snap-guides line')).not.toHaveCount(0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(async () => (await readWorkspace(request)).boards[0].notes![1].position)
      .toEqual({ x: 605, y: 140 });
  } finally {
    await context.close();
  }
});
