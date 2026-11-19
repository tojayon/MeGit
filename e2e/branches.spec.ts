import { newBranchAtCommit, openRepositoryTools, selectBranch } from './branch-tree-helpers';
import { test, expect } from './test';
import type { APIRequestContext, Page } from '@playwright/test';
import { fixture, commitFile, git } from '../tests/fixtures.js';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const inspect = await (
    await request.post('/api/repositories/inspect', { headers, data: { path: repo } })
  ).json();
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'branches', name: '分支演示', path: inspect.path }];
  workspace.boards[0].nodes = [{ id: 'n', repoId: 'branches', position: { x: 80, y: 100 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '查看分支演示', exact: true }).click();
  await expect(page.getByRole('region', { name: '分支生长树', exact: true })).toBeVisible();
}

test('创建中文分支、切换、查找和安全删除后同步白板；撤销不影响 Git', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await open(page);
    await newBranchAtCommit(page, await git(f.repo, 'rev-parse', 'HEAD'));
    await page.getByLabel('分支名称', { exact: true }).fill('功能/登录');
    await page.getByLabel('创建后切换', { exact: true }).check();
    await page.getByRole('button', { name: '创建分支', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.tree-tip.current')).toContainText('功能/登录');
    await expect(page.getByTestId('repository-node')).toContainText('功能/登录');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('功能/登录');
    await page.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '筛选分支', exact: true }).click();
    await page.getByRole('searchbox', { name: '筛选分支', exact: true }).fill('登录');
    await expect(page.locator('.branch-tree-search-results .button')).toHaveCount(1);
    await page.getByRole('button', { name: '功能/登录', exact: true }).click();
    await selectBranch(page, 'main');
    await page.getByRole('button', { name: '切换到 main', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '切换分支', exact: true })).toContainText(
      '分支演示',
    );
    await page.getByRole('button', { name: '切换分支', exact: true }).click();
    await expect(page.locator('.tree-tip.current')).toContainText('main');
    await selectBranch(page, '功能/登录');
    await page.getByRole('button', { name: '删除 功能/登录', exact: true }).click();
    await page.getByRole('button', { name: '删除分支', exact: true }).click();
    await expect(page.locator('.tree-tip')).toHaveCount(1);
    await page.getByRole('button', { name: '关闭仓库详情' }).click();
    await page.getByRole('button', { name: '添加说明', exact: true }).click();
    await page.getByRole('button', { name: '关闭说明详情', exact: true }).click();
    await expect(page.getByRole('button', { name: '撤销白板编辑', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    expect(await git(f.repo, 'branch', '--list', '功能/登录')).toBe('');
  } finally {
    await f.cleanup();
  }
});

test('远端跟踪分支只读本地缓存；两主题、英文和窄屏可用', async ({ page, request }) => {
  const f = await fixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const head = await commitFile(f.repo);
    await git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/repository.git');
    await git(f.repo, 'update-ref', 'refs/remotes/origin/feature', head);
    await seed(request, f.repo);
    await open(page);
    await page.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '显示远端分支', exact: true }).click();
    await selectBranch(page, 'origin/feature');
    await page.getByRole('button', { name: '从 origin/feature 创建本地分支', exact: true }).click();
    await expect(page.getByLabel('跟踪远端分支')).toBeChecked();
    await page.getByLabel('分支名称', { exact: true }).fill('本地/feature');
    await page.getByLabel('创建后切换').check();
    await page.getByRole('button', { name: '创建分支', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await git(f.repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/feature');
    await page.screenshot({ path: '.megit/verification/branches/dark.png', fullPage: true });
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Branch growth tree', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await newBranchAtCommit(page, head, true);
    await page.getByLabel('Branch name', { exact: true }).fill('bad name');
    await expect(page.getByRole('button', { name: 'Create branch', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Invalid branch name');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: '.megit/verification/branches/light-en-mobile.png',
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test('删除未合并分支保持错误与分支；过期确认被拒绝并可刷新重试', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'unmerged');
    await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    await seed(request, f.repo);
    await open(page);
    await selectBranch(page, 'unmerged');
    await page.getByRole('button', { name: '删除 unmerged', exact: true }).click();
    await page.getByRole('button', { name: '删除分支', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('全部提交');
    expect(await git(f.repo, 'branch', '--list', 'unmerged')).toContain('unmerged');
    await page.keyboard.press('Escape');
    await selectBranch(page, 'unmerged');
    await page.getByRole('button', { name: '切换到 unmerged', exact: true }).click();
    await commitFile(f.repo, 'concurrent.txt');
    await page.getByRole('button', { name: '切换分支', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('当前分支或提交已变化');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await page.getByRole('button', { name: '刷新状态', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await selectBranch(page, 'unmerged');
    await page.getByRole('button', { name: '切换到 unmerged', exact: true }).click();
    await page.getByRole('button', { name: '切换分支', exact: true }).click();
    await expect(page.locator('.tree-tip.current')).toContainText('unmerged');
    await openRepositoryTools(page, 'history');
    await expect(page.locator('.commit-row')).toHaveCount(3);
  } finally {
    await f.cleanup();
  }
});

test('未提交修改可仅创建分支，切换被禁用且状态说明可见', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'branch', 'feature');
    await writeFile(path.join(f.repo, 'draft.txt'), 'keep me');
    await seed(request, f.repo);
    await open(page);
    await selectBranch(page, 'feature');
    await expect(
      page.getByText('工作区还有未提交修改，请先提交或自行处理后再切换分支。', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '切换到 feature', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '收起分支详情', exact: true }).click();
    await newBranchAtCommit(page, await git(f.repo, 'rev-parse', 'HEAD'));
    await page.getByLabel('分支名称', { exact: true }).fill('draft-branch');
    await expect(page.getByLabel('创建后切换')).toBeDisabled();
    await page.getByRole('button', { name: '创建分支', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    expect(await git(f.repo, 'branch', '--list', 'draft-branch')).toContain('draft-branch');
  } finally {
    await f.cleanup();
  }
});

test('分支操作处理中防重复和意外关闭，服务错误按当前语言保留', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'branch', 'feature');
    await seed(request, f.repo);
    await open(page);
    await selectBranch(page, 'feature');
    await page.getByRole('button', { name: '切换到 feature', exact: true }).focus();
    await expect(page.getByRole('tooltip')).toContainText('切换分支');
    await expect(page.getByRole('tooltip')).toContainText('会改变工作区的文件版本');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await selectBranch(page, 'feature');
    await page.getByRole('button', { name: '切换到 feature', exact: true }).click();
    let count = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/repositories/branches/actions', async (route) => {
      count++;
      await pending;
      await route.continue();
    });
    const submit = page.getByRole('button', { name: '切换分支', exact: true });
    await submit.click();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('button', { name: '关闭切换分支', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    // A file changed after opening the confirmation must be checked by the service.
    await writeFile(path.join(f.repo, 'concurrent-draft.txt'), 'preserve');
    release();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('未提交修改');
    expect(count).toBe(1);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
    await page.keyboard.press('Escape');
    await unlink(path.join(f.repo, 'concurrent-draft.txt'));
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh local status', exact: true }).click();
    await selectBranch(page, 'feature', true);
    await page.getByRole('button', { name: 'Switch to feature', exact: true }).click();
    await writeFile(path.join(f.repo, 'concurrent-draft.txt'), 'preserve');
    await page.getByRole('button', { name: 'Switch branch', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('uncommitted changes');
  } finally {
    await f.cleanup();
  }
});

test('切换分支后重新计算 HEAD 关系和更新白板状态', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'feature');
    await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', '-b', 'main', f.repo, target);
    await seed(request, f.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories.push({ id: 'target', name: '关系目标', path: target });
    workspace.boards[0].nodes.push({ id: 't', repoId: 'target', position: { x: 450, y: 100 } });
    workspace.boards[0].edges = [
      {
        id: 'e',
        source: 'n',
        target: 't',
        kind: 'integration',
        label: '',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
    ];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await open(page);
    await expect(page.getByRole('button', { name: /代码整合.*已包含/ })).toBeVisible();
    await selectBranch(page, 'feature');
    await page.getByRole('button', { name: '切换到 feature', exact: true }).click();
    await page.getByRole('button', { name: '切换分支', exact: true }).click();
    await expect(page.getByRole('button', { name: /代码整合.*待整合 1/ })).toBeVisible();
    await expect(page.getByTestId('repository-node').filter({ hasText: '分支演示' })).toContainText(
      'feature',
    );
    await selectBranch(page, 'main');
    await page.getByRole('button', { name: '切换到 main', exact: true }).click();
    await page.getByRole('button', { name: '切换分支', exact: true }).click();
    await expect(page.getByRole('button', { name: /代码整合.*已包含/ })).toBeVisible();
  } finally {
    await f.cleanup();
  }
});
