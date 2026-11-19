import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

test('仓库卡片两行信息和直接暂存提交，共用详情草稿，失败保留并阻止重复提交', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'new.txt'), 'new content\n');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'card-repo', name: '卡片仓库', path: f.repo }];
    workspace.boards[0].nodes = [{ id: 'node', repoId: 'card-repo', position: { x: 0, y: 0 } }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    const card = page.getByTestId('repository-node');
    await expect(card.getByRole('heading', { name: '卡片仓库' })).toBeVisible();
    await expect(card.getByLabel('提交说明', { exact: true })).toBeVisible();
    await expect(card.locator('.repository-card-meta')).toContainText('main');
    await expect(card.getByText('已修改 1', { exact: true })).toBeVisible();
    await expect(card.getByText('已暂存 0', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'AI 生成提交说明', exact: true })).toBeDisabled();
    const message = card.getByRole('textbox', { name: '提交说明', exact: true });
    await message.fill('卡片直接提交');
    const expand = card.getByRole('button', { name: '展开提交消息', exact: true });
    await expect(expand).toBeInViewport();
    await expand.click();
    const editor = page.getByRole('dialog', { name: '提交说明', exact: true });
    const expandedMessage = editor.getByRole('textbox', { name: '提交说明', exact: true });
    await expect(expandedMessage).toBeFocused();
    await expect(expandedMessage).toHaveValue('卡片直接提交');
    const draft = '卡片直接提交\n\n在展开的编辑框中填写正文';
    await expandedMessage.fill(draft);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(expand).toBeFocused();
    await expect(message).toHaveValue(draft);
    const position = await page.locator('.react-flow__node[data-id="node"]').boundingBox();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect(card.getByText('已修改 0', { exact: true })).toBeVisible();
    await expect(card.getByText('已暂存 1', { exact: true })).toBeVisible();
    await writeFile(path.join(f.repo, 'new.txt'), 'staged content changed again\n');
    await page.getByRole('button', { name: '刷新本地状态', exact: true }).click();
    await expect(card.getByText('已修改 1', { exact: true })).toBeVisible();
    await expect(card.getByText('已暂存 1', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect(card.getByText('已修改 0', { exact: true })).toBeVisible();
    const darkCommit = card.getByRole('button', { name: '提交', exact: true });
    await expect(darkCommit).toBeEnabled();
    await expect(darkCommit).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    await darkCommit.hover();
    await expect(darkCommit).toHaveCSS('background-color', 'rgb(1, 37, 87)');
    await card.getByRole('button', { name: '查看卡片仓库', exact: true }).click();
    await page.getByRole('button', { name: '查看分支 main', exact: true }).click();
    await expect(
      page.locator('.branch-tree-selection').getByLabel('提交说明', { exact: true }),
    ).toHaveValue(draft);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let count = 0;
    await page.route('**/repositories/card-repo/actions', async (route) => {
      count++;
      await delayed;
      await route.fulfill({ status: 400, json: { code: 'gitFailed' } });
    });
    await card.getByRole('button', { name: '提交', exact: true }).click();
    await expect(
      page
        .locator('.branch-tree-selection')
        .getByRole('button', { name: '提交 1 个文件', exact: true }),
    ).toBeDisabled();
    await expect(card.getByRole('button', { name: '提交', exact: true })).toBeDisabled();
    expect(count).toBe(1);
    release();
    await expect(card.getByRole('alert')).toBeVisible();
    await page.unroute('**/repositories/card-repo/actions');
    await page.getByRole('button', { name: '关闭仓库详情', exact: true }).click();
    await page.route('**/repositories/card-repo/actions', async (route) => {
      if (route.request().postDataJSON().type === 'commit')
        await route.fulfill({ status: 400, json: { code: 'gitFailed' } });
      else await route.continue();
    });
    await card.getByRole('button', { name: '提交', exact: true }).click();
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(message).toHaveValue(draft);
    await page.unroute('**/repositories/card-repo/actions');
    await page.reload();
    await expect(message).toHaveValue(draft);
    await card.getByRole('button', { name: '提交', exact: true }).click();
    await expect(card.getByLabel('提交说明', { exact: true })).toHaveValue('');
    await expect(card.getByText('已修改 0', { exact: true })).toBeVisible();
    await expect(card.getByText('已暂存 0', { exact: true })).toBeVisible();
    expect(await git(f.repo, 'log', '-1', '--format=%B')).toBe(draft);
    expect((await git(f.repo, 'status', '--porcelain')).trim()).toBe('');
    const after = (await page.locator('.react-flow__node[data-id="node"]').boundingBox())!;
    expect(after.width).toBe(position!.width);
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    await expect(card.getByLabel('Commit message', { exact: true })).toBeVisible();
    await expect(card.getByText('Modified 0', { exact: true })).toBeVisible();
    await expect(card.getByText('Staged 0', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Commit', exact: true })).toBeDisabled();
  } finally {
    await f.cleanup();
  }
});

test('仓库卡片真实示例在双主题和窄屏保持两行信息与单行操作', async ({ page }) => {
  await page.goto('/design-system');
  const card = page.getByTestId('repository-node');
  await card.scrollIntoViewIfNeeded();
  const toolbar = card.locator('.repository-card-actions');
  await expect(toolbar).toHaveCSS('background-color', 'rgb(233, 237, 243)');
  await expect(toolbar.locator('.repository-card-message')).toHaveCSS(
    'background-color',
    'rgb(245, 246, 248)',
  );
  await expect(toolbar.getByRole('textbox')).toHaveCSS('color', 'rgb(36, 40, 46)');
  const darkStage = toolbar.getByRole('button', { name: '全部暂存', exact: true });
  await expect(darkStage).toHaveCSS('background-color', 'rgb(74, 116, 17)');
  await darkStage.hover();
  await expect(darkStage).toHaveCSS('background-color', 'rgb(54, 84, 12)');
  const geometry = await card.evaluate((element) => {
    const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
    const avatar = box('.repository-avatar');
    const title = box('h3');
    const branch = box('.repository-card-meta');
    const actions = box('.repository-card-actions');
    return {
      avatar: avatar.height,
      lines: branch.bottom - title.top,
      actionsBelow: actions.top > branch.bottom,
      overflow: element.scrollWidth > element.clientWidth,
    };
  });
  expect(geometry.avatar).toBeGreaterThanOrEqual(geometry.lines - 1);
  expect(geometry.actionsBelow).toBe(true);
  expect(geometry.overflow).toBe(false);
  await card.getByLabel('提交说明', { exact: true }).fill('完善仓库卡片');
  await page.screenshot({ path: '.megit/verification/repository-card/dark.png' });
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toolbar).toHaveCSS('background-color', 'rgb(36, 40, 46)');
  const lightStage = toolbar.getByRole('button', { name: 'Stage all', exact: true });
  await expect(lightStage).toHaveCSS('background-color', 'rgb(134, 210, 31)');
  await lightStage.hover();
  await expect(lightStage).toHaveCSS('background-color', 'rgb(94, 147, 22)');
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByLabel('Commit message', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Expand commit message', exact: true })).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Generate commit message with AI', exact: true }),
  ).toBeDisabled();
  await card.getByRole('button', { name: 'Generate commit message with AI', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('Stage the files');
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Stage all', exact: true }).click();
  await card.getByRole('button', { name: 'Generate commit message with AI', exact: true }).click();
  await expect(card.getByLabel('Commit message', { exact: true })).toHaveValue(
    'Improve repository card layout',
  );
  const lightCommit = toolbar.getByRole('button', { name: 'Commit', exact: true });
  await expect(lightCommit).toHaveCSS('background-color', 'rgb(128, 212, 249)');
  await lightCommit.hover();
  await expect(lightCommit).toHaveCSS('background-color', 'rgb(76, 195, 247)');
  await card.screenshot({ path: '.megit/verification/repository-card/light-card.png' });
});
