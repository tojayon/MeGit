import { openRepositoryTools } from './branch-tree-helpers';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

test('精简工具栏通过键盘和悬停显示说明，支持 Escape 关闭', async ({ page }) => {
  await page.goto('/');
  const preferences = page.getByRole('button', { name: '偏好设置', exact: true });
  await preferences.focus();
  await expect(page.getByRole('tooltip')).toHaveText('偏好设置');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '使用帮助', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('使用帮助');
});

test('主题与语言独立切换、刷新恢复，英文错误与窄屏设置可用', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('button', { name: '偏好设置', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('界面语言').selectOption('en');
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Add repository', exact: true }).first().click();
  await page.getByLabel('Repository path', { exact: true }).fill('Z:\\megit-missing-fixture');
  await page.getByRole('button', { name: 'Add to workflow', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Directory does not exist');
  await page.getByRole('button', { name: 'Close Add local repository' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#workspace-navigation')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Interface language').selectOption('zh-CN');
  await expect(page.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
  await page.getByRole('button', { name: '关闭偏好设置' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(errors).toEqual([]);
});

test('两主题覆盖白板、仓库历史和二进制差异，语言切换保留用户内容', async ({ page }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', f.repo, target);
    await writeFile(path.join(f.repo, 'binary.dat'), Buffer.from([1, 0, 2, 3]));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(
      async ({ source, target }) => {
        const { token } = await fetch('/api/session').then((r) => r.json());
        const headers = { 'Content-Type': 'application/json', 'X-MeGit-Token': token };
        const workspace = await fetch('/api/workspace', { headers }).then((r) => r.json());
        const inspect = (path: string) =>
          fetch('/api/repositories/inspect', {
            method: 'POST',
            headers,
            body: JSON.stringify({ path }),
          }).then((r) => r.json());
        const [s, t] = await Promise.all([inspect(source), inspect(target)]);
        workspace.repositories = [
          { id: 'source', name: '共享仓库 α', path: s.path },
          { id: 'target', name: '服务仓库 β', path: t.path },
        ];
        workspace.boards = [
          {
            id: 'visual',
            name: '本地开发 / Preview',
            description: '',
            nodes: [
              { id: 's', repoId: 'source', position: { x: 50, y: 50 } },
              { id: 't', repoId: 'target', position: { x: 510, y: 190 } },
            ],
            edges: [
              {
                id: 'integration',
                source: 's',
                target: 't',
                kind: 'integration',
                label: '公共功能整合 · 自定义',
                sourceRef: 'HEAD',
                targetRef: 'HEAD',
              },
            ],
          },
        ];
        workspace.activeBoardId = 'visual';
        const response = await fetch('/api/workspace', {
          method: 'PUT',
          headers,
          body: JSON.stringify(workspace),
        });
        if (!response.ok) throw new Error(await response.text());
      },
      { source: f.repo, target },
    );
    await page.reload();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    const minimap = page.getByTestId('rf__minimap');
    const toolbar = page.locator('.canvas-bottom .canvas-tools');
    const rail = page.locator('.workspace-action-rail');
    await page.mouse.move(0, 0);
    await expect(toolbar).toHaveCSS('opacity', '0');
    await expect(rail.locator(':scope > :nth-child(2)')).toHaveCSS('opacity', '0');
    await expect(rail.locator(':scope > :first-child')).toHaveCSS('opacity', '1');
    await rail.locator(':scope > :first-child').hover();
    await expect(rail.locator(':scope > :nth-child(2)')).toHaveCSS('opacity', '1');
    await toolbar.hover();
    await expect(toolbar).toHaveCSS('opacity', '1');
    const toggle = toolbar.getByRole('button', { name: '流程缩略图', exact: true });
    await expect(toolbar).toHaveCSS('flex-direction', 'column');
    await expect(toolbar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(toolbar).toHaveCSS('border-top-width', '0px');
    await expect(toolbar).toHaveCSS('box-shadow', 'none');
    await expect(toolbar.locator('..')).toHaveCSS('left', '8px');
    await expect(toolbar.locator('..')).toHaveCSS('bottom', '8px');
    await expect(minimap).toHaveCSS('overflow', 'hidden');
    const toolbarBox = (await toolbar.boundingBox())!;
    const mapBox = (await minimap.boundingBox())!;
    expect(mapBox.x).toBeGreaterThan(toolbarBox.x + toolbarBox.width);
    expect(mapBox.y + mapBox.height).toBeCloseTo(toolbarBox.y + toolbarBox.height);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(minimap).toHaveCount(0);
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(minimap).toBeVisible();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences' }).click();
    await expect(toolbar.getByRole('button', { name: 'Workflow minimap' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('main', { name: '本地开发 / Preview', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /公共功能整合 · 自定义.*Included/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'View 共享仓库 α', exact: true }).click();
    await openRepositoryTools(page, 'history', page, true);
    await expect(page.getByRole('button', { name: /测试提交/ })).toBeVisible();
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(2);
    await page.screenshot({
      path: '.megit/verification/theme-dark-en.png',
      fullPage: true,
      animations: 'disabled',
    });
    await openRepositoryTools(page, 'worktree', page, true);
    await page.getByRole('button', { name: 'binary.dat', exact: true }).click();
    await expect(page.getByTestId('diff-view')).toContainText(
      'Binary file; no text diff is available.',
    );
    await page.screenshot({
      path: '.megit/verification/diff-dark-en.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click();
    if (await page.getByRole('dialog', { name: 'Working tree', exact: true }).count())
      await page.getByRole('button', { name: 'Close Working tree', exact: true }).click();
    if (await page.getByRole('dialog', { name: 'History', exact: true }).count())
      await page.getByRole('button', { name: 'Close History', exact: true }).click();
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.screenshot({
      path: '.megit/verification/preferences-light-en.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close Preferences' }).click();
    await page.screenshot({
      path: '.megit/verification/theme-light-en.png',
      fullPage: true,
      animations: 'disabled',
    });
    await openRepositoryTools(page, 'worktree', page, true);
    await page.getByRole('button', { name: 'binary.dat', exact: true }).click();
    await expect(page.getByTestId('diff-view')).toContainText(
      'Binary file; no text diff is available.',
    );
    await page.screenshot({
      path: '.megit/verification/diff-light-en.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('main', { name: '本地开发 / Preview', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /公共功能整合 · 自定义.*Included/ }),
    ).toBeVisible();
  } finally {
    await f.cleanup();
  }
});

test('偏好存储损坏或受限时可恢复并提示，页面仍可使用', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('megit.preferences', '{broken'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('alert').filter({ hasText: '已忽略无效的偏好设置' })).toBeVisible();
  await page.getByRole('button', { name: '偏好设置', exact: true }).first().click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭偏好设置' }).click();
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value() {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    });
  });
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '暗黑', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('浏览器无法保存偏好');
});

test('跨页面同步语言和主题时，关系表单错误与读屏名称即时重译', async ({ page, context }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', f.repo, target);
    await page.goto('/');
    for (const [repoPath, name] of [
      [f.repo, 'Source'],
      [target, 'Target'],
    ]) {
      await page.getByRole('button', { name: '添加仓库', exact: true }).click();
      await page.getByLabel('仓库路径').fill(repoPath);
      await page.getByLabel('卡片显示名称').fill(name);
      await page.getByRole('button', { name: '添加到工作流' }).click();
      await expect(page.getByTestId('repository-node').filter({ hasText: name })).toBeVisible();
    }
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toHaveAttribute(
      'aria-roledescription',
      '仓库节点',
    );
    await page.getByRole('button', { name: '建立关系', exact: true }).click();
    const source = await page.getByLabel('来源仓库').inputValue();
    await page.getByLabel('目标仓库').selectOption(source);
    await page.getByRole('button', { name: '保存关系', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('请选择两个不同的仓库。');
    const other = await context.newPage();
    await other.goto('/');
    await other.getByRole('button', { name: '偏好设置', exact: true }).click();
    await other.getByLabel('界面语言').selectOption('en');
    await other.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('dialog', { name: 'Create workflow relation' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Select two different repositories.');
    await expect(page.locator('.react-flow__node').first()).toHaveAttribute(
      'aria-roledescription',
      'Repository node',
    );
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: /^Target repository/ })
      .selectOption({ label: 'Target' });
    await page.getByRole('button', { name: 'Save relation', exact: true }).click();
    await expect(page.getByRole('button', { name: /Code integration.*Included/ })).toBeVisible();
    await expect(page.locator('.react-flow__edge')).toHaveAttribute(
      'aria-roledescription',
      'Workflow edge',
    );
    await expect(page.getByRole('button', { name: 'View Source', exact: true })).toBeVisible();
    await other.close();
    await page.bringToFront();
    await page.keyboard.press('Tab');
    await page.locator('.react-flow__edge').focus();
    await expect(page.locator('.react-flow__edge')).toBeFocused();
    await expect(page.locator('.workflow-edge-path')).toHaveCSS('stroke-width', '3px');
  } finally {
    await f.cleanup();
  }
});
