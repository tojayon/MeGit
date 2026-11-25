import { openRepositoryTools } from './branch-tree-helpers';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

async function seed(request: APIRequestContext, repoPath: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'help', name: '学习 Git', path: repoPath }];
  Object.assign(workspace.boards[0], {
    nodes: [{ id: 'repo', repoId: 'help', position: { x: 120, y: 320 } }],
    viewport: { x: 0, y: 0, zoom: 0.8 },
  });
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  return (await request.get('/api/workspace', { headers })).json();
}

test('仓库原始信息按需打开，信息按钮在关闭左侧，外点和 Escape 正确恢复焦点', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    const seeded = await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看学习 Git', exact: true }).click();
    const repo = page.getByRole('complementary', { name: '学习 Git 仓库详情', exact: true });
    await expect(repo.locator('.repository-path')).toHaveCount(0);
    const info = repo.getByRole('button', { name: '仓库信息', exact: true });
    const close = repo.getByRole('button', { name: '关闭仓库详情', exact: true });
    await expect(info).toBeVisible();
    expect((await info.boundingBox())!.x).toBeLessThan((await close.boundingBox())!.x);
    await info.click();
    const popup = page.getByRole('dialog', { name: '仓库信息', exact: true });
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(seeded.repositories[0].path);
    await expect(popup).toContainText(head);
    await expect(popup).toContainText('本地检查时间');
    await page.screenshot({ path: '.megit/verification/git-help/info-dark-zh.png' });
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(info).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await info.click();
    await page.mouse.click(600, 500);
    await expect(popup).toHaveCount(0);
    await info.click();
    await repo.getByRole('button', { name: '分支生长树说明', exact: true }).focus();
    await expect(popup).toHaveCount(0);
    await repo.getByRole('button', { name: '分支生长树说明', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(repo.getByRole('button', { name: '分支生长树说明', exact: true })).toBeFocused();
  } finally {
    await f.cleanup();
  }
});

test('Git 详细帮助支持悬停、键盘和点击固定，说明本地与远端操作的真实含义', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/demo.git');
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看学习 Git', exact: true }).click();
    const repo = page.getByRole('complementary', { name: '学习 Git 仓库详情', exact: true });
    const branchHelp = repo.getByRole('button', { name: '分支生长树说明', exact: true });
    await branchHelp.focus();
    await expect(page.getByRole('tooltip')).toContainText('分支');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await branchHelp.click();
    await page.mouse.move(200, 650);
    await expect(page.getByRole('tooltip')).toContainText('分支');
    await page.keyboard.press('Escape');
    await repo.getByRole('button', { name: '查看分支 main', exact: true }).click();
    await repo.getByRole('button', { name: '获取', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('不会改动');
    await expect(page.getByRole('tooltip')).toContainText('远端');
    await page.keyboard.press('Escape');
    await repo.getByRole('button', { name: '图上比较：main', exact: true }).click();
    await repo.getByRole('button', { name: '图上比较说明', exact: true }).focus();
    await expect(page.getByRole('tooltip')).toContainText('独有');
    await page.keyboard.press('Escape');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
  } finally {
    await f.cleanup();
  }
});

test('信息浮层与长帮助在明亮英文触控窄屏中可阅读，关闭不改变仓库状态', async ({
  browser,
  request,
}) => {
  const f = await fixture();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await commitFile(f.repo);
    await git(f.repo, 'remote', 'add', 'origin', 'https://offline.invalid/demo.git');
    const before = await git(f.repo, 'status', '--porcelain=v1');
    const seeded = await seed(request, f.repo);
    await context.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en', navigationCollapsed: true }),
      ),
    );
    const page = await context.newPage();
    const actions: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/actions')) actions.push(request.url());
    });
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await page.getByRole('button', { name: 'View 学习 Git', exact: true }).tap();
    const repo = page.getByRole('complementary', {
      name: '学习 Git repository details',
      exact: true,
    });
    await repo.getByRole('button', { name: 'Repository information', exact: true }).tap();
    const popup = page.getByRole('dialog', { name: 'Repository information', exact: true });
    await expect(popup).toContainText(seeded.repositories[0].path);
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(382);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '.megit/verification/git-help/info-light-en-mobile.png' });
    await page.keyboard.press('Escape');
    await repo.getByRole('button', { name: 'About Branch growth tree', exact: true }).tap();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('branch');
    expect(await tooltip.evaluate((element) => element.matches(':popover-open'))).toBe(true);
    await page.screenshot({ path: '.megit/verification/git-help/help-light-en-mobile.png' });
    await page.keyboard.press('Escape');
    await repo.getByRole('button', { name: 'View branch main', exact: true }).tap();
    await repo.getByRole('button', { name: 'About Synchronization status', exact: true }).tap();
    await expect(page.getByRole('tooltip')).toContainText('Upload commits');
    await expect(page.getByRole('tooltip')).toContainText('fast-forward');
    await expect(page.getByRole('tooltip')).toContainText('without changing current worktree');
    await page.keyboard.press('Escape');
    expect(await git(f.repo, 'status', '--porcelain=v1')).toBe(before);
    expect(actions).toEqual([]);
  } finally {
    await context.close();
    await f.cleanup();
  }
});

test('详细说明可移入阅读，Escape 先关闭帮助再关闭仓库信息', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看学习 Git', exact: true }).click();
    const repo = page.getByRole('complementary', { name: '学习 Git 仓库详情', exact: true });
    await repo.getByRole('button', { name: '仓库信息', exact: true }).click();
    const popup = page.getByRole('dialog', { name: '仓库信息', exact: true });
    await popup.getByRole('button', { name: '提交编号与 HEAD说明', exact: true }).hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('历史版本');
    const box = (await tooltip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('暂存、提交和差异帮助只解释操作，不改变 Git 或提交草稿', async ({ page, request }) => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'staged.txt'), 'staged content\n');
    await git(f.repo, 'add', '--', 'staged.txt');
    await writeFile(path.join(f.repo, 'new.txt'), 'unstaged content\n');
    const before = await git(f.repo, 'status', '--porcelain=v1');
    await seed(request, f.repo);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/actions') || request.url().endsWith('/action'))
        writes.push(request.url());
    });
    await page.goto('/');
    await page.getByRole('button', { name: '查看学习 Git', exact: true }).click();
    const repo = page.getByRole('complementary', { name: '学习 Git 仓库详情', exact: true });
    await openRepositoryTools(page, 'worktree', repo);
    await repo.getByRole('button', { name: '已暂存说明', exact: true }).click();
    await expect(page.getByRole('tooltip')).toContainText('文件修改会保留');
    await expect(page.getByRole('tooltip')).toContainText('从下一次提交的清单中移出');
    await page.keyboard.press('Escape');
    await repo.getByLabel('提交说明', { exact: true }).fill('保留我的提交草稿');
    await repo.getByRole('button', { name: '提交操作说明', exact: true }).click();
    await expect(page.getByRole('tooltip')).toContainText('不会自动上传');
    await page.keyboard.press('Escape');
    await repo.getByRole('button', { name: 'new.txt', exact: true }).click();
    const diff = page.getByRole('dialog', { name: '差异', exact: true });
    await diff.getByRole('button', { name: '工作区差异说明', exact: true }).click();
    await expect(page.getByRole('tooltip')).toContainText('加号是新增行');
    await page.keyboard.press('Escape');
    await expect(diff).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(diff).toHaveCount(0);
    await expect(repo.getByLabel('提交说明', { exact: true })).toHaveValue('保留我的提交草稿');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'status', '--porcelain=v1')).toBe(before);
    expect(writes).toEqual([]);
    await page.screenshot({ path: '.megit/verification/git-help/worktree-dark-zh.png' });
  } finally {
    await f.cleanup();
  }
});

test('关系比较提供通俗解释，无法判断的原因始终可见', async ({ page, request }) => {
  const f = await fixture();
  const second = await fixture();
  try {
    await commitFile(f.repo);
    await commitFile(second.repo, 'unrelated.txt', 'unrelated history\n');
    const workspace = await seed(request, f.repo);
    workspace.repositories.push({ id: 'second', name: '目标库', path: second.repo });
    workspace.boards[0].nodes.push({
      id: 'target',
      repoId: 'second',
      position: { x: 600, y: 180 },
    });
    workspace.boards[0].edges = [
      {
        id: 'comparison',
        source: 'repo',
        target: 'target',
        kind: 'integration',
        label: '',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
    ];
    const { token } = await (await request.get('/api/session')).json();
    expect(
      (
        await request.put('/api/workspace', {
          headers: { 'X-MeGit-Token': token },
          data: workspace,
        })
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.locator('[data-edge-id="comparison"]').click();
    const relation = page.getByRole('complementary', { name: '流程关系详情', exact: true });
    await relation.getByRole('button', { name: '代码整合说明', exact: true }).click();
    await expect(page.getByRole('tooltip')).toContainText('不会自动合并');
    await page.keyboard.press('Escape');
    const reason = relation.getByText(/目标仓库尚未获取来源提交/);
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('把来源仓库的本机路径添加为远端');
    await expect(reason).toContainText('获取不会合并改动');
    const basis = relation.locator('summary');
    if (await basis.count()) await basis.click();
    await expect(reason).toBeVisible();
  } finally {
    await f.cleanup();
    await second.cleanup();
  }
});
