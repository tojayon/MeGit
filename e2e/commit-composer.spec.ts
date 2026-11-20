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

test('分支详情和工作区只高亮待同步方向，推送先确认', async ({ page, request }) => {
  const f = await fixture();
  try {
    const initial = await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await git(f.repo, 'push', '-u', 'origin', 'main');
    const next = await commitFile(f.repo, 'local.txt', 'ready\n');
    await setup(request, page, f.repo);
    let calls = 0;
    page.on('request', (outgoing) => {
      if (outgoing.method() === 'POST' && outgoing.url().includes('/commit-repo/actions')) calls++;
    });
    const confirm = page.getByRole('dialog', { name: '推送', exact: true });
    const push = page.locator('.branch-tree-selection').getByRole('button', { name: '推送', exact: true });
    await expect(push).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    await push.press('Enter');
    await expect(confirm).toContainText('提交中心 · main → 提交中心 · origin/main');
    await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(push).toBeFocused();
    expect(calls).toBe(0);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(initial);

    await page.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    const worktree = page.getByRole('dialog', { name: '工作区', exact: true });
    const worktreePush = worktree.getByRole('button', { name: '推送', exact: true });
    await expect(worktreePush).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    await worktreePush.click();
    await expect(confirm).toBeVisible();
    expect(calls).toBe(0);
    await confirm.getByRole('button', { name: '推送', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(worktree).toBeVisible();
    await expect(worktreePush).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(calls).toBe(1);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(next);

    const peer = path.join(f.root, 'peer');
    await git(f.root, 'clone', '--branch', 'main', remote, peer);
    await git(peer, 'config', 'user.name', 'MeGit Test');
    await git(peer, 'config', 'user.email', 'test@example.invalid');
    await git(peer, 'config', 'core.hooksPath', path.join(f.root, 'no-hooks'));
    const upstream = await commitFile(peer, 'upstream.txt', 'ready to pull\n');
    await git(peer, 'push');
    await worktree.getByRole('button', { name: '获取', exact: true }).click();
    const worktreePull = worktree.getByRole('button', { name: '拉取', exact: true });
    await expect(worktreePull).toHaveCSS('background-color', 'rgb(170, 224, 98)');
    await expect(worktreePush).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await worktreePull.click();
    const pullConfirm = page.getByRole('dialog', { name: '拉取', exact: true });
    const pullAction = pullConfirm.getByRole('button', { name: '拉取', exact: true });
    await expect(pullAction).toHaveCSS('background-color', 'rgb(170, 224, 98)');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(next);
    await pullAction.click();
    await expect(pullConfirm).toHaveCount(0);
    await expect(worktreePull).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(upstream);
  } finally {
    await f.cleanup();
  }
});

test('HEAD 卡片直接暂存、取消暂存和提交；草稿与工作区共用且失败保留', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'new.txt'), 'new content\n');
    await setup(request, page, f.repo);
    const card = page.locator('.branch-tree-selection');
    await expect(card.getByLabel('提交说明', { exact: true })).toBeVisible();
    await card.getByLabel('提交说明', { exact: true }).fill('从 HEAD 直接提交');
    const commit = card.getByRole('button', { name: '提交', exact: true });
    await expect(commit).toBeDisabled();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect.poll(async () => git(f.repo, 'diff', '--cached', '--name-only')).toBe('new.txt');
    await card.getByRole('button', { name: '全部取消', exact: true }).click();
    await expect.poll(async () => git(f.repo, 'diff', '--cached', '--name-only')).toBe('');
    await page.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '工作区', exact: true });
    const titleContext = dialog.locator('.dialog-title-context');
    await expect(titleContext.locator(':scope > *')).toHaveText(['工作区', '', /提交中心\s*main/]);
    await expect(titleContext.locator(':scope > :nth-child(2)')).toHaveAttribute(
      'data-repository-id',
      'commit-repo',
    );
    await expect(dialog.getByLabel('提交说明', { exact: true })).toHaveValue('从 HEAD 直接提交');
    await dialog.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect(commit).toBeEnabled();
    await page.route('**/api/repositories/commit-repo/actions', (route) =>
      route.fulfill({ status: 500, json: { error: { code: 'gitFailed' } } }),
    );
    await commit.click();
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card.getByLabel('提交说明', { exact: true })).toHaveValue('从 HEAD 直接提交');
    await page.unroute('**/api/repositories/commit-repo/actions');
    await commit.click();
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

for (const [theme, stageColor, danger] of [
  ['暗黑', 'rgb(74, 116, 17)', 'rgb(255, 155, 167)'],
  ['明亮', 'rgb(134, 210, 31)', 'rgb(182, 53, 75)'],
] as const) {
  test(`${theme}详情的批量暂存和取消只在可用时着色`, async ({ page, request }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      await writeFile(path.join(f.repo, 'new.txt'), 'new content\n');
      await setup(request, page, f.repo);
      await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);

      const card = page.locator('.branch-tree-selection');
      const stage = card.getByRole('button', { name: '全部暂存', exact: true });
      const unstage = card.getByRole('button', { name: '全部取消', exact: true });
      const toolbarStage = page.locator('.repository-card-actions .repository-card-stage');
      await expect(toolbarStage).toHaveCSS('background-color', stageColor);
      await expect(stage).toBeEnabled();
      await expect(stage).toHaveCSS('background-color', stageColor);
      await expect(unstage).toBeDisabled();
      await expect(unstage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      await stage.press('Enter');
      await expect(stage).toBeDisabled();
      await expect(stage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(unstage).toBeEnabled();
      await expect(unstage).toHaveCSS('background-color', danger);

      await unstage.press('Enter');
      await expect(stage).toBeEnabled();
      await expect(stage).toHaveCSS('background-color', stageColor);
      await expect(unstage).toBeDisabled();
    } finally {
      await f.cleanup();
    }
  });
}

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
    const commit = card.getByRole('button', { name: 'Commit', exact: true });
    await expect(commit).toBeEnabled();
    await commit.focus();
    await expect(page.getByRole('tooltip')).toContainText("commit -m 'Save narrow screen change'");
    await page.keyboard.press('Escape');
    await page.screenshot({ path: '.megit/verification/commit-composer/head-light-en-mobile.png' });
    await page.getByRole('button', { name: 'View working changes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Working tree', exact: true });
    await expect(dialog.locator('.dialog-title-context > h2')).toHaveText('Working tree');
    await expect(dialog.locator('.worktree-dialog-branch')).toBeInViewport();
    await expect(
      dialog.getByRole('button', { name: 'Close Working tree', exact: true }),
    ).toBeInViewport();
    await expect(dialog.getByLabel('Commit message', { exact: true })).toHaveValue(
      'Save narrow screen change',
    );
    await expect(dialog.getByLabel('Commit message', { exact: true })).toBeInViewport();
    const sync = dialog.getByRole('region', { name: 'Branch sync', exact: true });
    await expect(sync.getByRole('button', { name: 'Fetch', exact: true })).toBeInViewport();
    const pull = sync.getByRole('button', { name: 'Pull', exact: true });
    await expect(pull).toBeInViewport();
    await expect(pull).toBeDisabled();
    await expect(pull).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const push = sync.getByRole('button', { name: 'Push', exact: true });
    await expect(push).toBeInViewport({ ratio: 1 });
    const syncBox = (await sync.boundingBox())!;
    const pushBox = (await push.boundingBox())!;
    expect(pushBox.x + pushBox.width).toBeCloseTo(syncBox.x + syncBox.width, 0);
    expect(await dialog.evaluate((element) => element.scrollWidth)).toBe(
      await dialog.evaluate((element) => element.clientWidth),
    );
    const modified = dialog.getByRole('region', { name: 'Working tree changes', exact: true });
    const staged = dialog.getByRole('region', { name: 'Staged', exact: true });
    const modifiedBox = (await modified.boundingBox())!;
    const stagedBox = (await staged.boundingBox())!;
    expect(modifiedBox.x).toBe(stagedBox.x);
    expect(stagedBox.y).toBeGreaterThanOrEqual(modifiedBox.y + modifiedBox.height);
    await page.screenshot({
      path: '.megit/verification/commit-composer/worktree-light-en-mobile.png',
    });
    const worktreeCommit = dialog.getByRole('button', { name: 'Commit 1 file', exact: true });
    await expect(worktreeCommit).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    await worktreeCommit.click();
    await expect
      .poll(async () => git(f.repo, 'log', '-1', '--format=%s'))
      .toBe('Save narrow screen change');
  } finally {
    await f.cleanup();
  }
});

test('工作区双栏独立滚动并恢复，提交栏固定在底部', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await git(f.repo, 'push', '-u', 'origin', 'main');
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        writeFile(path.join(f.repo, `staged-${i}.txt`), 'change\n'),
      ),
    );
    await git(f.repo, 'add', '--all');
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        writeFile(path.join(f.repo, `change-${i}.txt`), 'change\n'),
      ),
    );
    await setup(request, page, f.repo);
    const branchDetail = page.locator('.branch-tree-selection');
    await expect(branchDetail.getByRole('button', { name: '拉取', exact: true })).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await page.getByRole('button', { name: '查看工作区改动', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '工作区', exact: true });
    const message = dialog.getByLabel('提交说明', { exact: true });
    await expect(message).toHaveAttribute('rows', '1');
    await expect(dialog.locator('.commit-compact-summary')).toHaveCount(0);
    const sync = dialog.getByRole('region', { name: '分支同步', exact: true });
    await expect(sync).toContainText('待推送 0');
    await expect(sync).toContainText('待拉取 0');
    await expect(sync).toContainText('跟踪 origin/main');
    const fetchButton = sync.getByRole('button', { name: '获取', exact: true });
    const pullButton = sync.getByRole('button', { name: '拉取', exact: true });
    const pushButton = sync.getByRole('button', { name: '推送', exact: true });
    await expect(pullButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(fetchButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(pushButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const button of [fetchButton, pullButton, pushButton]) {
      await expect(button).toBeInViewport();
      await expect(button).toBeEnabled();
      await expect(button.locator('.button-label')).toBeVisible();
    }
    const [fetchBox, pullBox, pushBox] = await Promise.all(
      [fetchButton, pullButton, pushButton].map((button) => button.boundingBox()),
    );
    expect(fetchBox!.y).toBe(pullBox!.y);
    expect(pullBox!.y).toBe(pushBox!.y);
    const titleBox = (await dialog.locator('.dialog-header').boundingBox())!;
    const syncBox = (await sync.boundingBox())!;
    const trackingBox = (await sync.getByText('跟踪 origin/main', { exact: true }).boundingBox())!;
    expect(trackingBox.x + trackingBox.width / 2).toBeCloseTo(syncBox.x + syncBox.width / 2, 0);
    expect(pushBox!.x + pushBox!.width).toBeCloseTo(syncBox.x + syncBox.width, 0);
    expect(trackingBox.x + trackingBox.width).toBeLessThan(fetchBox!.x);
    expect(syncBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
    const modifiedHeader = dialog.locator('.file-group > header').filter({ hasText: '工作区修改' });
    const stagedHeader = dialog.locator('.file-group > header').filter({ hasText: '已暂存' });
    const stageAll = modifiedHeader.getByRole('button', { name: '全部暂存', exact: true });
    const unstageAll = stagedHeader.getByRole('button', { name: '全部取消', exact: true });
    await expect(stageAll).toHaveCSS('background-color', 'rgb(74, 116, 17)');
    await expect(unstageAll).toHaveCSS('background-color', 'rgb(255, 155, 167)');
    const commit = dialog.getByRole('button', { name: '提交 40 个文件', exact: true });
    await expect(commit).toBeDisabled();
    await expect(commit).toHaveCSS('background-color', 'rgb(36, 40, 46)');
    for (const [header, button] of [[modifiedHeader, stageAll], [stagedHeader, unstageAll]]) {
      await expect(button).toBeEnabled();
      const headerBox = (await header.boundingBox())!;
      const buttonBox = (await button.boundingBox())!;
      expect(headerBox.y).toBeGreaterThanOrEqual(syncBox.y + syncBox.height);
      expect(headerBox.x + headerBox.width - buttonBox.x - buttonBox.width).toBeLessThan(10);
    }
    await dialog.getByRole('button', { name: '展开提交消息' }).click();
    const editor = page.getByRole('dialog', { name: '提交说明', exact: true });
    await expect(editor.getByRole('textbox')).toBeFocused();
    await editor.getByRole('textbox').press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(message).toBeInViewport();
    await message.fill('先写这次的目标');
    await expect(commit).toBeEnabled();
    await expect(commit).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    const modified = dialog.getByRole('region', { name: '工作区修改', exact: true });
    const staged = dialog.getByRole('region', { name: '已暂存', exact: true });
    const modifiedBox = (await modified.boundingBox())!;
    const stagedBox = (await staged.boundingBox())!;
    const footer = dialog.locator('.commit-compact-row');
    const footerBox = (await footer.boundingBox())!;
    expect(modifiedBox.y).toBe(stagedBox.y);
    expect(modifiedBox.x + modifiedBox.width).toBeLessThan(stagedBox.x);
    expect(footerBox.y).toBeGreaterThanOrEqual(stagedBox.y + stagedBox.height);
    await modified.evaluate((element) => element.scrollTo(0, 200));
    await expect.poll(() => modified.evaluate((element) => element.scrollTop)).toBe(200);
    expect(await staged.evaluate((element) => element.scrollTop)).toBe(0);
    await staged.evaluate((element) => element.scrollTo(0, 300));
    await expect.poll(() => staged.evaluate((element) => element.scrollTop)).toBe(300);
    expect(await modified.evaluate((element) => element.scrollTop)).toBe(200);
    expect(await footer.boundingBox()).toEqual(footerBox);
    expect(await sync.boundingBox()).toEqual(syncBox);
    expect(await dialog.evaluate((element) => element.scrollHeight)).toBe(
      await dialog.evaluate((element) => element.clientHeight),
    );
    await page.reload();
    await expect.poll(() => modified.evaluate((element) => element.scrollTop)).toBe(200);
    await expect.poll(() => staged.evaluate((element) => element.scrollTop)).toBe(300);
    await expect(message).toHaveValue('先写这次的目标');
    await unstageAll.click();
    await expect(dialog.getByRole('button', { name: '提交 0 个文件', exact: true })).toBeDisabled();
    await stageAll.click();
    await expect(dialog.getByRole('button', { name: '提交 80 个文件', exact: true })).toBeEnabled();
    await expect(stageAll).toBeDisabled();
    await expect(stageAll).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
    await expect(card.getByRole('button', { name: '提交', exact: true })).toBeDisabled();
  } finally {
    await f.cleanup();
  }
});
