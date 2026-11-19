import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

async function seed(request: APIRequestContext, repo: string, second?: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const { path } = await (
    await request.post('/api/repositories/inspect', { headers, data: { path: repo } })
  ).json();
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'point', name: '提交点演示', path }];
  workspace.boards[0].nodes = [{ id: 'node', repoId: 'point', position: { x: 80, y: 100 } }];
  if (second) {
    workspace.repositories.push({ id: 'second', name: '对照仓库', path: second });
    workspace.boards[0].nodes.push({
      id: 'second-node',
      repoId: 'second',
      position: { x: 600, y: 100 },
    });
  }
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '查看提交点演示', exact: true }).click();
  await expect(page.getByRole('region', { name: '分支生长树', exact: true })).toBeVisible();
}

test('点选历史提交先打开附近工具，固定起点创建分支而不切换代码', async ({ page, request }) => {
  const f = await fixture();
  try {
    const root = await commitFile(f.repo);
    const head = await commitFile(f.repo, 'next.txt');
    await seed(request, f.repo);
    await open(page);
    const controls = page.locator('.branch-tree-view-controls');
    await expect(controls.getByRole('button', { name: '新建分支', exact: true })).toHaveCount(0);
    const point = page.locator(`[data-commit="${root}"]`);
    await point.click();
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    await expect(menu).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(menu).toContainText(root.slice(0, 7));
    await page.mouse.move(400, 150);
    await page.screenshot({
      path: '.megit/verification/commit-point-actions/dark-zh.png',
      animations: 'disabled',
    });
    await menu.getByRole('button', { name: '从此提交新建分支', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建分支', exact: true });
    await expect(dialog).toContainText(root);
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByLabel('创建后切换', { exact: true })).not.toBeChecked();
    await dialog.getByLabel('分支名称', { exact: true }).fill('feature/from-root');
    expect(await git(f.repo, 'branch', '--list', 'feature/from-root')).toBe('');
    await dialog.getByRole('button', { name: '创建分支', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await git(f.repo, 'rev-parse', 'refs/heads/feature/from-root')).toBe(root);
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await expect(
      page.getByRole('button', { name: '查看分支 feature/from-root', exact: true }),
    ).toBeVisible();
    await expect(point).toBeFocused();
  } finally {
    await f.cleanup();
  }
});

test('并排仓库的提交菜单互斥，创建只作用于所点仓库', async ({ page, request }) => {
  const first = await fixture();
  const second = await fixture();
  try {
    const a = await commitFile(first.repo, 'first.txt');
    const b = await commitFile(second.repo, 'second.txt');
    await seed(request, first.repo, second.repo);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await page.locator(`[data-commit="${a}"]`).click();
    await expect(page.getByRole('dialog', { name: '提交操作', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '对照仓库', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '提交操作', exact: true })).toHaveCount(0);
    await expect(page.locator('.dock-card')).toHaveCount(2);
    const point = page.locator(`[data-commit="${b}"]`);
    await point.click();
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    await expect(menu).toHaveCount(1);
    await expect(menu).toContainText(b.slice(0, 7));
    await menu.getByRole('button', { name: '从此提交新建分支', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建分支', exact: true });
    await expect(dialog).toContainText('对照仓库');
    await dialog.getByLabel('分支名称', { exact: true }).fill('second-only');
    await dialog.getByRole('button', { name: '创建分支', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await git(second.repo, 'rev-parse', 'refs/heads/second-only')).toBe(b);
    expect(await git(first.repo, 'branch', '--list', 'second-only')).toBe('');
  } finally {
    await second.cleanup();
    await first.cleanup();
  }
});

test('设计规范页复用提交工具和创建窗口，仅操作本地示例', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url());
  });
  await page.goto('/design-system');
  const tree = page.getByRole('region', { name: '分支生长树', exact: true });
  await tree.getByRole('button', { name: /的操作：root$/ }).click();
  const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
  await menu.getByRole('button', { name: '从此提交新建分支', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建分支', exact: true });
  await dialog.getByLabel('分支名称', { exact: true }).fill('feature/demo');
  await dialog.getByRole('button', { name: '创建分支', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    tree.getByRole('button', { name: '查看分支 feature/demo', exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test('查看差异准确对应根提交及合并提交的第一父提交，关闭回到圆点', async ({ page, request }) => {
  const f = await fixture();
  const queries: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/diff?')) queries.push(r.url());
  });
  try {
    const root = await commitFile(f.repo, 'root.txt', 'initial-only\n');
    await git(f.repo, 'switch', '-c', 'feature');
    await commitFile(f.repo, 'feature.txt', 'feature-only\n');
    await git(f.repo, 'switch', 'main');
    await commitFile(f.repo, 'main.txt', 'main-only\n');
    await git(f.repo, 'merge', '--no-ff', 'feature', '-m', 'fixture merge');
    const merge = await git(f.repo, 'rev-parse', 'HEAD');
    await seed(request, f.repo);
    await open(page);
    for (const [hash, text] of [
      [root, '+initial-only'],
      [merge, '+feature-only'],
    ]) {
      const point = page.locator(`[data-commit="${hash}"]`);
      await point.click();
      const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
      await menu.getByRole('button', { name: '查看差异', exact: true }).click();
      const dialog = page.locator('dialog[open]');
      await expect(dialog).toContainText(text);
      if (hash === merge) await expect(dialog).not.toContainText('+main-only');
      expect(queries.at(-1)).toContain(`commit=${hash}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(point).toBeFocused();
    }
  } finally {
    await f.cleanup();
  }
});

test('复制完整编号有成功及失败反馈，键盘提示与菜单按层级退出', async ({
  page,
  request,
  context,
}) => {
  const f = await fixture();
  try {
    const hash = await commitFile(f.repo);
    await seed(request, f.repo);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    const point = page.locator(`[data-commit="${hash}"]`);
    await point.focus();
    await expect(page.getByRole('tooltip')).toContainText('初始提交');
    await expect(page.getByRole('tooltip')).toContainText('测试提交');
    await expect(page.getByRole('tooltip')).not.toContainText('提交点操作');
    await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    await expect(menu).toBeFocused();
    const create = menu.getByRole('button', { name: '从此提交新建分支', exact: true });
    await create.focus();
    await expect(page.getByRole('tooltip')).toContainText('默认保留当前代码');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(point).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Space');
    await menu.getByRole('button', { name: '复制完整提交编号', exact: true }).click();
    await expect(menu.getByRole('status')).toHaveText('已复制完整提交编号');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(hash);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => {
          throw new Error('fixture denied');
        },
      });
    });
    await menu.getByRole('button', { name: '复制完整提交编号', exact: true }).click();
    await expect(menu.getByRole('alert')).toContainText('复制失败');
    await expect(menu.locator('.commit-point-copy-failure code')).toHaveText(hash);
    const tools = page.getByRole('button', { name: '分支树工具', exact: true });
    await tools.focus();
    await expect(menu).toHaveCount(0);
    await expect(tools).toBeFocused();
  } finally {
    await f.cleanup();
  }
});

test.describe('提交点触控', () => {
  test.use({ hasTouch: true });
  test('缩小后相邻分支标签不会遮住提交圆点', async ({ page, request }) => {
    const f = await fixture();
    try {
      const root = await commitFile(f.repo);
      await git(f.repo, 'branch', 'feature', root);
      const head = await commitFile(f.repo, 'next.txt');
      await seed(request, f.repo);
      await open(page);
      for (let i = 0; i < 5; i++)
        await page.getByRole('button', { name: '缩小分支树', exact: true }).tap();
      for (const hash of [head, root]) {
        const point = page.locator(`[data-commit="${hash}"]`);
        await point.scrollIntoViewIfNeeded();
        expect(
          await point.evaluate((e) => {
            const r = e.getBoundingClientRect();
            return (
              document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest('[data-commit]') as HTMLElement | null
            )?.dataset.commit;
          }),
        ).toBe(hash);
      }
    } finally {
      await f.cleanup();
    }
  });
  test('明亮英文窄屏和矮窗口中菜单不缩放、不裁切，滚轮只缩放地图并收起菜单', async ({
    page,
    request,
  }) => {
    const f = await fixture();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      const hash = await commitFile(f.repo);
      await seed(request, f.repo);
      await open(page);
      await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      await page.getByRole('button', { name: '明亮', exact: true }).click();
      await page.getByLabel('界面语言').selectOption('en');
      await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
      await page.setViewportSize({ width: 390, height: 420 });
      const tree = page.getByRole('region', { name: 'Branch growth tree', exact: true });
      for (let i = 0; i < 5; i++)
        await page.getByRole('button', { name: 'Zoom out of branch tree', exact: true }).tap();
      const point = page.locator(`[data-commit="${hash}"]`);
      const hit = await point.boundingBox();
      expect(hit!.width).toBeGreaterThanOrEqual(43.9);
      await point.tap();
      const menu = page.getByRole('dialog', { name: 'Commit actions', exact: true });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box!.width).toBe(280);
      expect(box!.x).toBeGreaterThanOrEqual(8);
      expect(box!.y).toBeGreaterThanOrEqual(8);
      expect(box!.x + box!.width).toBeLessThanOrEqual(382);
      expect(box!.y + box!.height).toBeLessThanOrEqual(412);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: '.megit/verification/commit-point-actions/light-en-touch.png',
        animations: 'disabled',
      });
      await menu.getByRole('button', { name: 'Close Commit actions', exact: true }).tap();
      await expect(point).toBeFocused();
      await point.tap();
      const before = await tree
        .locator('.branch-tree-drawing')
        .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a);
      await tree.dispatchEvent('wheel', { deltaY: -30, ctrlKey: true, clientX: 340, clientY: 200 });
      await expect(menu).toHaveCount(0);
      await expect
        .poll(() =>
          tree
            .locator('.branch-tree-drawing')
            .evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a),
        )
        .toBeGreaterThan(before);
      expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });
});

test('长提交工具面板内部滚动，保持地图比例', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'commit', '--allow-empty', '-m', 'Long commit details '.repeat(80));
    const hash = await git(f.repo, 'rev-parse', 'HEAD');
    await seed(request, f.repo);
    await page.setViewportSize({ width: 1000, height: 360 });
    await open(page);
    await page.locator(`[data-commit="${hash}"]`).click();
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    const drawing = page.locator('.branch-tree-drawing');
    const before = await drawing.evaluate((e) => getComputedStyle(e).transform);
    await menu.hover({ position: { x: 120, y: 100 } });
    await page.mouse.wheel(0, 260);
    await expect.poll(() => menu.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    expect(await drawing.evaluate((e) => getComputedStyle(e).transform)).toBe(before);
  } finally {
    await f.cleanup();
  }
});

test('复制等待和完成后保留键盘焦点，Escape 可以退出', async ({ page, request }) => {
  const f = await fixture();
  try {
    const hash = await commitFile(f.repo);
    await seed(request, f.repo);
    await open(page);
    await page.evaluate(() => {
      const pending = new Promise<void>((resolve) =>
        Object.defineProperty(window, 'finishFixtureCopy', { value: resolve }),
      );
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: () => pending,
      });
    });
    const point = page.locator(`[data-commit="${hash}"]`);
    await point.click();
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    const copy = menu.getByRole('button', { name: '复制完整提交编号', exact: true });
    await copy.focus();
    await page.keyboard.press('Enter');
    await expect(copy).toHaveAttribute('aria-busy', 'true');
    await expect(copy).toBeFocused();
    await page.evaluate(() =>
      (window as unknown as { finishFixtureCopy: () => void }).finishFixtureCopy(),
    );
    await expect(menu.getByRole('status')).toHaveText('已复制完整提交编号');
    await expect(copy).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(point).toBeFocused();
  } finally {
    await f.cleanup();
  }
});
