import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import type { APIRequestContext } from '@playwright/test';
import { openRepositoryTools } from './branch-tree-helpers';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'commands', name: '命令预览', path: repo }];
  workspace.boards[0].nodes = [{ id: 'node', repoId: 'commands', position: { x: 80, y: 100 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
}

test('提交悬停延迟显示真实事件，通用操作说明集中到地图帮助', async ({ page, request }) => {
  const f = await fixture();
  try {
    const root = await commitFile(f.repo);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看命令预览', exact: true }).click();
    const point = page.locator(`[data-commit="${root}"]`);
    await point.scrollIntoViewIfNeeded();
    await page.mouse.move(20, 20);
    await page.clock.install();
    await point.hover();
    await page.clock.fastForward(300);
    expect(await page.getByRole('tooltip').count()).toBe(0);
    await page.clock.fastForward(250);
    const hint = page.getByRole('tooltip');
    await expect(hint).toContainText('测试提交');
    await expect(hint).toContainText('初始提交');
    await expect(hint).toContainText('MeGit Test');
    await expect(hint).not.toContainText('点击提交点');
    await expect(hint).not.toContainText('从此提交新建分支');
    await page.keyboard.press('Escape');
    await point.focus();
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '分支生长树说明', exact: true }).click();
    await expect(hint).toContainText('填写名称并确认');
    const help = page.getByRole('button', { name: '分支生长树说明', exact: true });
    const anchorBox = (await help.boundingBox())!;
    const hintBox = (await hint.boundingBox())!;
    expect(
      hintBox.x + hintBox.width <= anchorBox.x ||
        hintBox.x >= anchorBox.x + anchorBox.width ||
        hintBox.y + hintBox.height <= anchorBox.y ||
        hintBox.y >= anchorBox.y + anchorBox.height,
    ).toBe(true);
    await help.click();
  } finally {
    await f.cleanup();
  }
});

test('暂存、取消暂存与提交预览跟随当前文件及正文，悬停不修改仓库', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const filename = "draft '$;.txt";
    await writeFile(path.join(f.repo, filename), 'draft');
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看命令预览', exact: true }).click();
    const dialog = await openRepositoryTools(page, 'worktree');
    const stage = dialog.getByRole('button', { name: `暂存 ${filename}`, exact: true });
    await stage.focus();
    const hint = page.getByRole('tooltip');
    await expect(hint.locator('code')).toContainText("add -- 'draft ''$;.txt'");
    expect(await git(f.repo, 'diff', '--cached', '--name-only')).toBe('');
    await stage.click();
    const unstage = dialog.getByRole('button', { name: `取消暂存 ${filename}`, exact: true });
    await expect(unstage).toBeEnabled();
    await unstage.focus();
    await expect(hint.locator('code')).toContainText("restore --staged -- 'draft ''$;.txt'");
    const message = "实现 '界面' $value`\n第二行";
    await dialog.getByLabel('提交说明', { exact: true }).fill(message);
    await dialog.getByRole('button', { name: /提交.*1/ }).focus();
    await expect(hint.locator('code')).toContainText("commit -m '实现 ''界面'' $value`\n第二行'");
    await page.keyboard.press('Escape');
    await unstage.click();
    await expect(stage).toBeVisible();
    expect(await git(f.repo, 'diff', '--cached', '--name-only')).toBe('');
    expect(await git(f.repo, 'rev-list', '--count', 'HEAD')).toBe('1');
  } finally {
    await f.cleanup();
  }
});

for (const english of [false, true]) {
  test(`普通与合并事件采用具体提交信息，${english ? '明亮英文窄屏' : '暗黑中文'}提示完整`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo, 'base.txt');
      await git(f.repo, 'switch', '-c', 'feature');
      await commitFile(f.repo, 'feature.txt');
      await git(f.repo, 'commit', '--amend', '-m', 'Implement search');
      const regular = await git(f.repo, 'rev-parse', 'HEAD');
      await git(f.repo, 'switch', 'main');
      await commitFile(f.repo, 'main.txt');
      await git(f.repo, 'merge', '--no-ff', 'feature', '-m', 'Merge search into main');
      const merge = await git(f.repo, 'rev-parse', 'HEAD');
      await seed(request, f.repo);
      if (english) {
        await page.addInitScript(() =>
          localStorage.setItem(
            'megit.preferences',
            JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
          ),
        );
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await page.goto('/');
      await page
        .getByRole('button', { name: english ? 'View 命令预览' : '查看命令预览', exact: true })
        .click();
      await expect(page.locator(`[data-commit="${merge}"]`)).toBeVisible();
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/repositories/')) requests.push(request.url());
      });
      for (const [hash, subject] of [
        [regular, 'Implement search'],
        [merge, 'Merge search into main'],
      ]) {
        await page.locator(`[data-commit="${hash}"]`).focus();
        const hint = page.getByRole('tooltip');
        await expect(hint).toContainText(subject);
        await expect(hint).toContainText(hash);
        await expect(hint).not.toContainText(english ? 'Click a commit' : '点击提交点');
        if (hash === merge) await expect(hint).toContainText(english ? 'Merge commit' : '合并提交');
        const box = await hint.boundingBox();
        const viewport = page.viewportSize()!;
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        await page.keyboard.press('Escape');
      }
      expect(requests).toEqual([]);
      if (english) {
        await page.locator(`[data-commit="${merge}"]`).click();
        await page.mouse.move(12, 12);
        const menu = page.getByRole('dialog', { name: 'Commit actions', exact: true });
        const diff = menu.getByRole('button', { name: 'View differences', exact: true });
        await diff.focus();
        const hint = page.getByRole('tooltip');
        await expect(hint.locator('code')).toContainText(merge);
        await expect(hint.locator('code')).toContainText('show --diff-merges=first-parent');
        const a = (await diff.boundingBox())!;
        const b = (await hint.boundingBox())!;
        expect(
          b.x + b.width <= a.x ||
            b.x >= a.x + a.width ||
            b.y + b.height <= a.y ||
            b.y >= a.y + a.height,
        ).toBe(true);
        await diff.click();
        await expect(page.getByRole('dialog', { name: 'Diff', exact: true })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await f.cleanup();
    }
  });
}

test('创建起点与确认参数的命令预览准确，查看差异使用所选提交', async ({ page, request }) => {
  const f = await fixture();
  try {
    const root = await commitFile(f.repo);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看命令预览', exact: true }).click();
    await page.locator(`[data-commit="${root}"]`).click();
    const menu = page.getByRole('dialog', { name: '提交操作', exact: true });
    // Keep the pointer away from the newly positioned menu while testing keyboard focus.
    await page.mouse.move(10, 10);
    await menu.getByRole('button', { name: '查看差异', exact: true }).focus();
    const hint = page.getByRole('tooltip');
    await expect(hint.locator('.git-command-code')).toContainText(
      `show --diff-merges=first-parent`,
    );
    await expect(hint.locator('.git-command-code')).toContainText(root);
    await page.keyboard.press('Escape');
    await menu.getByRole('button', { name: '复制完整提交编号', exact: true }).focus();
    await expect(hint).toContainText('不执行 Git 命令');
    await page.keyboard.press('Escape');
    await menu.getByRole('button', { name: '从此提交新建分支', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建分支', exact: true });
    await dialog.getByLabel('分支名称', { exact: true }).fill('feature/中文');
    const submit = dialog.getByRole('button', { name: '创建分支', exact: true });
    await submit.focus();
    await expect(hint.locator('.git-command-code')).toContainText('branch --no-track --');
    await expect(hint.locator('.git-command-code')).toContainText('feature/中文');
    await expect(hint.locator('.git-command-code')).toContainText(root);
    await page.keyboard.press('Escape');
    await dialog.getByLabel('创建后切换', { exact: true }).check();
    await submit.focus();
    await expect(hint.locator('.git-command-code')).toContainText('switch --no-guess');
    await expect(hint.locator('.git-command-code')).toContainText('--no-overwrite-ignore');
    expect(await git(f.repo, 'branch', '--list', 'feature/中文')).toBe('');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
  } finally {
    await f.cleanup();
  }
});

test('矮窗口中命令长提示不抢占工具菜单的方向导航', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await seed(request, f.repo);
    await page.setViewportSize({ width: 900, height: 360 });
    await page.goto('/');
    await page.getByRole('button', { name: '查看命令预览', exact: true }).click();
    await expect(page.locator('[data-commit]')).toBeVisible();
    await page.getByRole('button', { name: '分支树工具', exact: true }).click();
    await page.getByRole('button', { name: '查看提交历史', exact: true }).focus();
    const hint = page.getByRole('tooltip');
    await expect(hint.locator('code')).toContainText('log --all HEAD');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: '显示远端分支', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('button', { name: '刷新状态', exact: true })).toBeFocused();
  } finally {
    await f.cleanup();
  }
});
