import { openRepositoryTools } from './branch-tree-helpers';
import { test, expect } from './test';
import { dragConnection } from './connection-helpers';
import { fixture, commitFile, git } from '../tests/fixtures.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

test('流程白板连接真实仓库，保存布局，查看历史与暂存提交', async ({ page }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const target = path.join(f.root, 'service');
    await git(f.root, 'clone', f.repo, target);
    await git(target, 'config', 'user.name', 'MeGit Test');
    await git(target, 'config', 'user.email', 'test@example.invalid');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '把仓库连接成工作流' })).toBeVisible();
    const addRepo = async (repoPath: string, name: string) => {
      await page.getByRole('button', { name: '添加仓库', exact: true }).first().click();
      await page.getByLabel('仓库路径').fill(repoPath);
      await page.getByLabel('卡片显示名称').fill(name);
      await page.getByRole('button', { name: '添加到白板' }).click();
      await expect(page.getByTestId('repository-node').filter({ hasText: name })).toBeVisible();
    };
    await addRepo(f.repo, '公共编辑器');
    await addRepo(target, '在线服务');
    const sourceHandle = page
      .getByTestId('repository-node')
      .filter({ hasText: '公共编辑器' })
      .locator('.react-flow__handle[data-handleid="source-right"]');
    const targetHandle = page
      .getByTestId('repository-node')
      .filter({ hasText: '在线服务' })
      .locator('.react-flow__handle[data-handleid="target-left"]');
    await dragConnection(page, sourceHandle, targetHandle);
    await expect(page.getByRole('dialog', { name: '建立流程关系' })).toBeVisible();
    await page.getByLabel('来源仓库').selectOption({ label: '公共编辑器' });
    await page.getByLabel('目标仓库').selectOption({ label: '在线服务' });
    await page.getByLabel('关系类型').selectOption('integration');
    await page.getByRole('button', { name: '保存关系' }).click();
    await expect(page.getByRole('button', { name: /代码整合.*已包含/ })).toBeVisible();
    const node = page.getByTestId('repository-node').filter({ hasText: '公共编辑器' });
    const nodeBox = await node.boundingBox();
    if (!nodeBox) throw new Error('node missing');
    await page.mouse.move(nodeBox.x + 80, nodeBox.y + 25);
    await page.mouse.down();
    await page.mouse.move(nodeBox.x + 120, nodeBox.y + 75, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /代码整合.*已包含/ })).toBeVisible();
    await page.getByRole('button', { name: '查看公共编辑器' }).click();
    const sourcePanel = page.getByRole('complementary', {
      name: '公共编辑器 仓库详情',
      exact: true,
    });
    await openRepositoryTools(page, 'history', sourcePanel);
    await page.locator('.commit-row').filter({ hasText: '测试提交' }).first().click();
    await expect(page.getByTestId('diff-view')).toContainText('+first');
    await writeFile(path.join(f.repo, 'browser.txt'), 'saved in browser\n');
    await page.getByRole('button', { name: '关闭差异' }).click();
    await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await page.getByRole('button', { name: '刷新本地状态' }).click();
    await openRepositoryTools(page, 'worktree', sourcePanel);
    await page.getByRole('button', { name: '暂存 browser.txt' }).click();
    await page.getByRole('dialog').getByLabel('提交说明', { exact: true }).fill('通过 MeGit 提交');
    await page.getByRole('button', { name: /提交 1 个文件/ }).click();
    await expect(page.getByText('工作区干净', { exact: true })).toBeVisible();
    await openRepositoryTools(page, 'history', sourcePanel);
    await expect(page.getByRole('button', { name: /通过 MeGit 提交/ })).toBeVisible();
    await expect(page.locator('.commit-row').first()).toBeVisible();
    await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await expect(
      page
        .getByTestId('repository-node')
        .filter({ hasText: '公共编辑器' })
        .getByText('已修改 0', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /代码整合.*待核对/ })).toBeVisible();
    await expect(page.getByText('公共编辑器：提交已保存到本地仓库', { exact: true })).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/workflow-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    if (await page.getByRole('dialog', { name: '提交历史', exact: true }).count())
      await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await sourcePanel.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '添加仓库', exact: true }).first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: '.megit/verification/workflow-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test('获取远端后刷新已打开的历史，并支持多个白板和键盘操作', async ({ page }) => {
  const failedSnapshots: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/snapshot') && response.status() >= 400)
      failedSnapshots.push(response.url());
  });
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await git(f.repo, 'push', '-u', 'origin', 'main');
    const peer = path.join(f.root, 'peer');
    await git(f.root, 'clone', '-b', 'main', remote, peer);
    await git(peer, 'config', 'user.name', 'MeGit Test');
    await git(peer, 'config', 'user.email', 'test@example.invalid');
    await page.goto('/');
    await page.getByRole('button', { name: '添加仓库', exact: true }).first().click();
    await page.getByLabel('仓库路径').fill(f.repo);
    await page.getByLabel('卡片显示名称').fill('接口项目');
    await page.getByRole('button', { name: '添加到白板' }).click();
    await page.getByRole('button', { name: '查看接口项目' }).click();
    await openRepositoryTools(page, 'history');
    await expect(page.locator('.commit-row').filter({ hasText: '测试提交' })).toHaveCount(1);
    await writeFile(path.join(peer, 'upstream.txt'), 'remote new\n');
    await git(peer, 'add', '--', 'upstream.txt');
    await git(peer, 'commit', '-m', '远端新增的功能');
    await git(peer, 'push');
    await page.getByRole('button', { name: '获取', exact: true }).click();
    await expect(page.getByRole('button', { name: /远端新增的功能/ })).toBeVisible();
    await expect(page.getByText('1 待拉取', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '拉取', exact: true }).click();
    await expect(page.getByText('0 待拉取', { exact: true })).toBeVisible();
    if (await page.getByRole('dialog', { name: '提交历史', exact: true }).count())
      await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: '新建流程', exact: true }).click();
    await page.getByLabel('流程名称').fill('第二条工作流');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('heading', { name: '把仓库连接成工作流' })).toBeVisible();
    await page
      .getByRole('button', { name: /开发流程/ })
      .first()
      .click();
    await expect(page.getByTestId('repository-node')).toHaveCount(1);
    const node = page.locator('.react-flow__node').first();
    await expect(node).toBeVisible();
    await node.focus();
    await expect(node).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(node).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: '接口项目 仓库详情' })).toBeVisible();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    if (await page.getByRole('dialog', { name: '提交历史', exact: true }).count())
      await page.getByRole('button', { name: '关闭提交历史', exact: true }).click();
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '打开流程导航' }).click();
    await expect(page.getByRole('button', { name: /第二条工作流/ })).toBeVisible();
    await page.getByRole('button', { name: /第二条工作流/ }).click();
    await expect(page.getByRole('heading', { name: '把仓库连接成工作流' })).toBeVisible();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    expect(failedSnapshots).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
