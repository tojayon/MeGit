import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures.js';
import type { APIRequestContext } from '@playwright/test';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const { path } = await (
    await request.post('/api/repositories/inspect', { headers, data: { path: repo } })
  ).json();
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'tree', name: '分支树演示', path }];
  workspace.boards[0].nodes = [{ id: 'node', repoId: 'tree', position: { x: 80, y: 100 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

test('仓库默认打开图形树，更换树干与比较不切换代码，文件按需打开', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', '功能/登录');
    await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    await commitFile(f.repo, 'main.txt');
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看分支树演示', exact: true }).click();
    const tree = page.getByRole('region', { name: '分支生长树', exact: true });
    await expect(tree).toBeVisible();
    await expect(page.locator('.file-group')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.screenshot({
      path: '.megit/verification/branch-tree/product-dark-zh.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '更换比较树干', exact: true }).click();
    const trunkDialog = page.getByRole('dialog', { name: '更换比较树干', exact: true });
    await trunkDialog.getByLabel('比较树干', { exact: true }).selectOption('refs/heads/功能/登录');
    await trunkDialog.getByRole('button', { name: '应用视角', exact: true }).click();
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    const branchLabel = tree.getByRole('button', { name: '查看分支 main', exact: true });
    const compare = tree.getByRole('button', { name: '图上比较：main', exact: true });
    const bounds = (await branchLabel.boundingBox())!;
    expect((await compare.boundingBox())!.x).toBeGreaterThan(bounds.x + bounds.width);
    await compare.press('Enter');
    const comparison = page.getByRole('dialog', { name: '图上比较', exact: true });
    await expect(comparison).toContainText('独有');
    await expect(comparison).toContainText('与 功能/登录 比较');
    await expect(comparison.getByRole('button', { name: '结束比较', exact: true })).toHaveCount(0);
    const popupBounds = (await comparison.boundingBox())!;
    expect(
      popupBounds.x >= bounds.x + bounds.width ||
        popupBounds.y >= bounds.y + bounds.height ||
        popupBounds.y + popupBounds.height <= bounds.y,
    ).toBe(true);
    await expect(page.locator('.branch-tree-selection')).toHaveCount(0);
    await expect(tree.locator('.tree-edge.source-only')).not.toHaveCount(0);
    await page.screenshot({
      path: '.megit/verification/branch-tree/product-comparison.png',
      animations: 'disabled',
    });
    const help = comparison.getByRole('button', { name: '图上比较说明', exact: true });
    await help.focus();
    await expect(page.getByRole('tooltip')).toContainText('独有');
    await page.keyboard.press('Escape');
    await expect(comparison).toBeVisible();
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await page.keyboard.press('Escape');
    await expect(comparison).toHaveCount(0);
    await expect(compare).toBeFocused();
    await expect(tree.locator('.tree-edge.source-only')).toHaveCount(0);
    for (const close of [
      () => comparison.getByRole('button', { name: '关闭图上比较', exact: true }).click(),
      () => branchLabel.click(),
      () => compare.click(),
    ]) {
      await compare.click();
      await expect(tree.locator('.tree-edge.source-only')).not.toHaveCount(0);
      await close();
      await expect(comparison).toHaveCount(0);
      await expect(tree.locator('.tree-edge.source-only')).toHaveCount(0);
    }
    await page.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '工作区', exact: true })).toBeVisible();
  } finally {
    await f.cleanup();
  }
});

test('分支标签外的差异按钮打开对应分支的最新提交', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'feature');
    const tip = await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    await commitFile(f.repo, 'main.txt');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/feature', tip);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看分支树演示', exact: true }).click();
    const tree = page.getByRole('region', { name: '分支生长树', exact: true });
    const detail = page.locator('.branch-tree-selection');
    const diff = page.getByRole('dialog', { name: '差异', exact: true });
    await expect(detail).toHaveCount(0);
    for (const name of ['feature', 'origin/feature']) {
      if (name.startsWith('origin/')) {
        await page.getByRole('button', { name: '分支树工具', exact: true }).click();
        await page.getByRole('button', { name: '显示远端分支', exact: true }).click();
      }
      const label = page.getByRole('button', { name: `查看分支 ${name}`, exact: true });
      const compare = tree.getByRole('button', { name: `图上比较：${name}`, exact: true });
      const shortcut = tree
        .locator('.tree-tip-anchor')
        .filter({ has: label })
        .getByRole('button', { name: `查看提交差异：${name}`, exact: true });
      await expect(shortcut).toBeVisible();
      const compareBox = (await compare.boundingBox())!;
      expect((await shortcut.boundingBox())!.x).toBeGreaterThan(compareBox.x + compareBox.width);
      if (name.startsWith('origin/')) await expect(shortcut).toHaveCSS('border-radius', '50%');
      await shortcut.click();
      await expect(diff.getByTestId('diff-view')).toContainText('feature.txt');
      await expect(diff).toContainText(tip.slice(0, 7));
      await expect(detail).toHaveCount(0);
      await diff.getByRole('button', { name: '关闭差异', exact: true }).click();
      await expect(shortcut).toBeFocused();
    }
    await tree.getByRole('button', { name: '查看分支 feature', exact: true }).click();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: /^查看提交/ })).toHaveCount(0);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
  } finally {
    await f.cleanup();
  }
});

test('真实合流、同点引用和长分支名在明亮英文及触控下可用', async ({ page, request }) => {
  const f = await fixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'feature/a-long-name-for-parallel-development');
    await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    await git(
      f.repo,
      'merge',
      '--no-ff',
      '--no-edit',
      'feature/a-long-name-for-parallel-development',
    );
    await git(f.repo, 'branch', 'same-tip');
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'View 分支树演示', exact: true }).click();
    const tree = page.getByRole('region', { name: 'Branch growth tree', exact: true });
    await expect(tree).toBeVisible();
    await expect(tree.locator('[data-merge="true"]')).not.toHaveCount(0);
    await tree.getByRole('button', { name: 'View branch same-tip', exact: true }).click();
    await expect(page.locator('.branch-tree-selection')).toContainText('same-tip');
    const compare = tree.getByRole('button', { name: 'Compare in tree: same-tip', exact: true });
    await compare.click();
    const popup = page.getByRole('dialog', { name: 'Compare in tree', exact: true });
    await expect(popup.getByRole('status')).not.toContainText('Checking');
    const popupBox = (await popup.boundingBox())!;
    expect(popupBox.x).toBeGreaterThanOrEqual(8);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(382);
    await page.screenshot({
      path: '.megit/verification/branch-tree/compare-light-en-mobile.png',
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(page.locator('.branch-tree-selection')).toContainText('same-tip');
    const diffShortcut = tree.getByRole('button', {
      name: 'View commit differences: same-tip',
      exact: true,
    });
    await diffShortcut.click();
    const diff = page.getByRole('dialog', { name: 'Diff', exact: true });
    const head = await git(f.repo, 'rev-parse', 'HEAD');
    await expect(diff).toContainText(head.slice(0, 7));
    await diff.getByRole('button', { name: 'Close Diff', exact: true }).click();
    await expect(diffShortcut).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await page.screenshot({
      path: '.megit/verification/branch-tree/product-light-en-mobile.png',
      animations: 'disabled',
    });
  } finally {
    await f.cleanup();
  }
});

test('外部切换后旧分支详情不能向新分支同步，延迟刷新后显示真实位置', async ({ page, request }) => {
  const f = await fixture();
  let release = () => {};
  try {
    const head = await commitFile(f.repo);
    await git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/example.git');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/main', head);
    await git(f.repo, 'branch', '--set-upstream-to=origin/main', 'main');
    await git(f.repo, 'branch', 'alias');
    await git(f.repo, 'branch', '--set-upstream-to=origin/main', 'alias');
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看分支树演示', exact: true }).click();
    await page.getByRole('button', { name: '查看分支 main', exact: true }).click();
    const worktree = page.locator('.branch-tree-selection').getByRole('group', { name: '工作区' });
    await expect(worktree).toBeVisible();
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    await page.route('**/branch-tree?**', async (route) => {
      held = true;
      await pending;
      await route.continue();
    });
    await git(f.repo, 'switch', 'alias');
    await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toContainText('alias');
    await expect.poll(() => held).toBe(true);
    await expect(worktree).toHaveCount(0);
    const push = page
      .locator('.branch-tree-selection')
      .getByRole('button', { name: '推送', exact: true });
    if (await push.count()) await expect(push).toBeDisabled();
    release();
    await expect(page.locator('.tree-tip.current')).toContainText('alias');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('alias');
  } finally {
    release();
    await f.cleanup();
  }
});

test('空仓库可按需开始首次提交；分支详情的帮助、资料与 Escape 逐层关闭', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看分支树演示', exact: true }).click();
    await expect(page.getByText('还没有提交，先记录第一个版本', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新建分支', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '工作区', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await commitFile(f.repo);
    await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
    const tip = page.getByRole('button', { name: '查看分支 main', exact: true });
    await tip.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.branch-tree-selection')).toBeFocused();
    await page.getByRole('button', { name: '分支原始信息', exact: true }).click();
    const info = page.getByRole('dialog', { name: '分支原始信息', exact: true });
    await expect(info).toContainText('refs/heads/main');
    await page.keyboard.press('Escape');
    await expect(info).toHaveCount(0);
    await expect(page.locator('.branch-tree-selection')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.branch-tree-selection')).toHaveCount(0);
    await expect(tip).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.getByRole('separator', { name: '调整详情区域宽度', exact: true }).focus();
    await page.keyboard.press('End');
    const offset = () =>
      page.locator('.branch-tree-viewport').evaluate((element) => {
        const dot = element
          .querySelector(
            '.tree-node.trunk > .tree-head-marker, .tree-node.trunk > circle:last-child',
          )!
          .getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return Math.abs(dot.x + dot.width / 2 - box.x - element.clientWidth / 2);
      });
    await expect.poll(offset).toBeLessThan(2);
    await page.getByRole('button', { name: '放大分支树', exact: true }).click();
    await expect.poll(offset).toBeLessThan(2);
  } finally {
    await f.cleanup();
  }
});
