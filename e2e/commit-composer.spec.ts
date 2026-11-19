import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

async function setup(request: APIRequestContext, page: Page, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'commit-repo', name: '提交中心', path: repo }];
  workspace.boards[0].nodes = [{ id: 'node', repoId: 'commit-repo', position: { x: 0, y: 0 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: '查看提交中心', exact: true }).click();
  await page.getByRole('button', { name: '查看分支 main', exact: true }).click();
}

test('HEAD 卡片直接暂存、取消暂存和提交；草稿与工作区共用且失败保留', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'new.txt'), 'new content\n');
    await setup(request, page, f.repo);
    const card = page.locator('.branch-tree-selection');
    await expect(card.getByLabel('提交说明', { exact: true })).toBeVisible();
    await card.getByLabel('提交说明', { exact: true }).fill('从 HEAD 直接提交');
    await expect(card.getByRole('button', { name: '提交 0 个文件', exact: true })).toBeDisabled();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect.poll(async () => git(f.repo, 'diff', '--cached', '--name-only')).toBe('new.txt');
    await card.getByRole('button', { name: '全部取消', exact: true }).click();
    await expect.poll(async () => git(f.repo, 'diff', '--cached', '--name-only')).toBe('');
    await card.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '工作区', exact: true });
    await expect(dialog.getByLabel('提交说明', { exact: true })).toHaveValue('从 HEAD 直接提交');
    await dialog.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect(card.getByRole('button', { name: '提交 1 个文件', exact: true })).toBeEnabled();
    await page.route('**/api/repositories/commit-repo/actions', (route) =>
      route.fulfill({ status: 500, json: { error: { code: 'gitFailed' } } }),
    );
    await card.getByRole('button', { name: '提交 1 个文件', exact: true }).click();
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card.getByLabel('提交说明', { exact: true })).toHaveValue('从 HEAD 直接提交');
    await page.unroute('**/api/repositories/commit-repo/actions');
    await card.getByRole('button', { name: '提交 1 个文件', exact: true }).click();
    await expect.poll(async () => git(f.repo, 'log', '-1', '--format=%s')).toBe('从 HEAD 直接提交');
    await expect(card.getByLabel('提交说明', { exact: true })).toHaveValue('');
    await expect(page.getByRole('dialog', { name: '工作区', exact: true })).toHaveCount(0);
    await git(f.repo, 'branch', 'feature/other');
    await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
    await page.getByRole('button', { name: '查看分支 feature/other', exact: true }).click();
    await expect(card.getByLabel('提交说明', { exact: true })).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('明亮英文窄屏可在 HEAD 提交，命令提示跟随说明，工作区保留同一草稿', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'new.txt'), 'new\n');
    await setup(request, page, f.repo);
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByRole('combobox').selectOption('en');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.locator('.branch-tree-selection');
    await card.getByLabel('Commit message', { exact: true }).fill('Save narrow screen change');
    await card.getByRole('button', { name: 'Stage all', exact: true }).click();
    const commit = card.getByRole('button', { name: 'Commit 1 file', exact: true });
    await expect(commit).toBeEnabled();
    await commit.focus();
    await expect(page.getByRole('tooltip')).toContainText("commit -m 'Save narrow screen change'");
    await page.keyboard.press('Escape');
    await page.screenshot({ path: '.megit/verification/commit-composer/head-light-en-mobile.png' });
    await card.getByRole('button', { name: 'View working changes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Working tree', exact: true });
    await expect(dialog.getByLabel('Commit message', { exact: true })).toHaveValue(
      'Save narrow screen change',
    );
    await expect(dialog.getByLabel('Commit message', { exact: true })).toBeInViewport();
    await page.screenshot({
      path: '.megit/verification/commit-composer/worktree-light-en-mobile.png',
    });
    await dialog.getByRole('button', { name: 'Commit 1 file', exact: true }).click();
    await expect
      .poll(async () => git(f.repo, 'log', '-1', '--format=%s'))
      .toBe('Save narrow screen change');
  } finally {
    await f.cleanup();
  }
});

test('工作区提交区在长文件列表上方，无暂存时也能写说明', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        writeFile(path.join(f.repo, `change-${i}.txt`), 'change\n'),
      ),
    );
    await setup(request, page, f.repo);
    await page
      .locator('.branch-tree-selection')
      .getByRole('button', { name: '查看工作区改动', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: '工作区', exact: true });
    const message = dialog.getByLabel('提交说明', { exact: true });
    await expect(message).toBeInViewport();
    await message.fill('先写这次的目标');
    const form = (await dialog.locator('.commit-form').boundingBox())!;
    const files = (await dialog.locator('.file-group').first().boundingBox())!;
    expect(form.y + form.height).toBeLessThanOrEqual(files.y);
    await expect(dialog.getByRole('button', { name: '提交 0 个文件', exact: true })).toBeDisabled();
  } finally {
    await f.cleanup();
  }
});

test('冲突时 HEAD 卡片明确说明并禁用提交', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo, 'conflict.txt', 'base\n');
    await git(f.repo, 'switch', '-c', 'feature');
    await commitFile(f.repo, 'conflict.txt', 'feature\n');
    await git(f.repo, 'switch', 'main');
    await commitFile(f.repo, 'conflict.txt', 'main\n');
    await git(f.repo, 'merge', 'feature').catch(() => undefined);
    await setup(request, page, f.repo);
    const card = page.locator('.branch-tree-selection');
    await card.getByLabel('提交说明', { exact: true }).fill('尚未解决冲突');
    await expect(card.locator('.commit-composer')).toContainText('请先解决冲突');
    await expect(card.getByRole('button', { name: /提交 \d+ 个文件/ })).toBeDisabled();
  } finally {
    await f.cleanup();
  }
});
