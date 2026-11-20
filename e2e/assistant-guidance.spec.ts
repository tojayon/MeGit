import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

async function prepare(page: Page, request: APIRequestContext, repo: string, endpoint?: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  if (endpoint)
    expect(
      (
        await request.put('/api/ai/settings', {
          headers,
          data: { endpoint, model: 'guide-demo', apiKey: '' },
        })
      ).ok(),
    ).toBe(true);
  else
    await page.route('**/api/ai/settings', (route) =>
      route.fulfill({
        json: { endpoint: 'http://127.0.0.1/v1', model: 'guide-demo', hasApiKey: false },
      }),
    );
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'guide-one', name: '引导仓库', path: repo }];
  workspace.boards[0].nodes = [{ id: 'guide-node', repoId: 'guide-one', position: { x: 0, y: 0 } }];
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  return { panel: page.getByRole('complementary', { name: 'MeGit AI 助手' }), headers };
}

test('无远端回复复用添加与发布表单，刷新不重放，工作区继续复用原操作', async ({
  page,
  request,
}) => {
  const f = await fixture();
  let output: unknown = { text: '仓库还没有配置远端。', operations: [] };
  let sent = '';
  const upstream = createServer(async (req, res) => {
    for await (const chunk of req) sent += chunk;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const head = await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const { panel, headers } = await prepare(
      page,
      request,
      f.repo,
      `http://127.0.0.1:${address.port}/v1`,
    );
    expect((await request.get('/api/ai/assistant/repositories/guide-one')).status()).toBe(403);
    expect(
      (await request.get('/api/ai/assistant/repositories/unknown', { headers })).status(),
    ).toBe(404);
    expect(
      (
        await request.get('/api/ai/assistant/repositories/guide-one', {
          headers: { ...headers, Origin: 'https://example.invalid' },
        })
      ).status(),
    ).toBe(403);
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('检查仓库是否可以推送');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    const guide = panel.getByRole('region', { name: '引导仓库 的快捷操作' });
    await expect(guide.getByRole('button', { name: '添加远端…', exact: true })).toBeVisible();
    expect(await git(f.repo, 'remote')).toBe('');
    expect(sent).not.toContain(f.repo);
    await guide.getByRole('button', { name: '添加远端…', exact: true }).focus();
    await expect(page.getByRole('tooltip')).toContainText('remote add');
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await guide.getByRole('button', { name: '添加远端…', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '添加远端', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel).toBeVisible();
    await guide.getByRole('button', { name: '添加远端…', exact: true }).click();
    await dialog.getByLabel('远端名称', { exact: true }).fill('origin');
    await dialog.getByLabel('远端地址或本机仓库路径', { exact: true }).fill(remote);
    await dialog.getByRole('button', { name: '添加远端', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(guide.getByRole('button', { name: '添加远端…', exact: true })).toHaveCount(0);
    await expect(guide.getByRole('button', { name: '发布分支…', exact: true })).toBeVisible();
    expect(await git(f.repo, 'remote')).toBe('origin');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    await page.screenshot({ path: '.megit/verification/assistant-guidance/dark-actions.png' });
    await page.reload();
    await expect(guide.getByRole('button', { name: '发布分支…', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await guide.getByRole('button', { name: '发布分支…', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '发布分支', exact: true });
    await expect(dialog).toBeVisible();
    expect(await git(remote, 'for-each-ref', '--format=%(refname)')).toBe('');
    await dialog.getByRole('button', { name: '发布分支', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(head);
    expect(await git(f.repo, 'config', '--list')).not.toContain('branch.main.remote=');
    await guide.getByRole('button', { name: '设置跟踪…', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '设置跟踪', exact: true });
    await dialog.getByLabel('远端分支', { exact: true }).selectOption('origin/main');
    await dialog.getByRole('button', { name: '设置跟踪', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await git(f.repo, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/main');
    await expect(guide.getByRole('button', { name: '设置跟踪…', exact: true })).toHaveCount(0);
    await expect(guide.getByRole('button', { name: '继续处理', exact: true })).toBeVisible();
    await guide.getByRole('button', { name: '继续处理', exact: true }).click();
    const draft = panel.getByRole('textbox', { name: '给 AI 助手的消息' });
    await expect(draft).toHaveValue(/请重新检查/);
    await writeFile(path.join(f.repo, 'feature.txt'), 'new work');
    output = {
      text: '请在工作区查看改动。',
      operations: [],
      guides: [{ repositoryId: 'guide-one', kind: 'worktree' }],
    };
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.locator('.assistant-guidance')).toHaveCount(1);
    await guide.getByRole('button', { name: '打开工作区', exact: true }).click();
    const worktree = page.getByRole('dialog', { name: '工作区', exact: true });
    await expect(worktree).toBeVisible();
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
    await worktree.getByRole('button', { name: '全部暂存', exact: true }).click();
    await expect.poll(() => git(f.repo, 'diff', '--cached')).toContain('new work');
    await worktree.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    const english = page.getByRole('complementary', { name: 'MeGit AI assistant' });
    await expect(english.getByRole('button', { name: 'Open worktree', exact: true })).toBeVisible();
    expect(await english.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: '.megit/verification/assistant-guidance/light-narrow.png' });
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await f.cleanup();
  }
});

test('点击旧引导重新核对状态，获取需确认，分支地图和远端管理复用原界面', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    const { panel } = await prepare(page, request, f.repo);
    let guides = [{ repositoryId: 'guide-one', kind: 'addRemote' }];
    await page.route('**/api/ai/assistant/chat', (route) =>
      route.fulfill({ json: { text: '请处理仓库的前置条件。', guides } }),
    );
    const send = async () => {
      await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('检查仓库');
      await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    };
    await send();
    await expect(panel.getByRole('button', { name: '添加远端…', exact: true })).toBeVisible();
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await panel.getByRole('button', { name: '添加远端…', exact: true }).click();
    await expect(panel.getByRole('button', { name: '添加远端…', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await panel.getByRole('button', { name: '获取远端', exact: true }).click();
    const fetchDialog = page.getByRole('dialog', { name: '获取远端', exact: true });
    await expect(fetchDialog).toBeVisible();
    await fetchDialog.getByRole('button', { name: '获取', exact: true }).click();
    await expect(fetchDialog).toHaveCount(0);
    guides = [
      { repositoryId: 'guide-one', kind: 'branches' },
      { repositoryId: 'guide-one', kind: 'remotes' },
    ];
    await send();
    await panel.getByRole('button', { name: '打开分支地图', exact: true }).click();
    const branches = page.getByRole('dialog', { name: '打开分支地图', exact: true });
    await expect(branches.locator('.branch-tree-viewport')).toBeVisible();
    await branches.getByRole('button', { name: '关闭打开分支地图', exact: true }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '管理远端', exact: true }).click();
    const remotes = page.getByRole('dialog', { name: '远端管理', exact: true });
    await expect(remotes.getByText('origin', { exact: true })).toBeVisible();
    await remotes.getByRole('button', { name: '检查读取访问', exact: true }).click();
    await expect(remotes.getByText('可读取', { exact: true })).toBeVisible();
  } finally {
    await f.cleanup();
  }
});

test('配置错误可直达设置，计划失效可刷新和重新准备且不自动发送', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const { panel } = await prepare(page, request, f.repo);
    let code = 'aiUnavailable';
    await page.route('**/api/ai/assistant/chat', (route) =>
      route.fulfill({ status: 409, json: { code } }),
    );
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('检查仓库');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await panel.getByRole('button', { name: '配置 AI 服务', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '软件设置', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭软件设置', exact: true }).click();
    code = 'assistantPlanExpired';
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.getByRole('button', { name: '刷新状态', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '刷新状态', exact: true }).click();
    await panel.getByRole('button', { name: '重新准备计划', exact: true }).click();
    await expect(panel.getByRole('textbox', { name: '给 AI 助手的消息' })).toHaveValue('检查仓库');
    await expect(panel.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled();
    await expect(panel.getByText('正在准备建议…', { exact: true })).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('已过期计划就地提供重新准备入口，不执行或自动发送', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const { panel } = await prepare(page, request, f.repo);
    const plan = {
      id: 'expired-guide',
      createdAt: '2020-01-01T00:00:00Z',
      expiresAt: '2020-01-01T00:01:00Z',
      status: 'ready',
      steps: [
        {
          id: 'step',
          repositoryId: 'guide-one',
          repositoryName: '引导仓库',
          branch: 'main',
          type: 'stageAll',
          status: 'pending',
          commands: [['add', '--', 'feature.txt']],
        },
      ],
    };
    let calls = 0;
    await page.route('**/api/ai/assistant/chat', (route) => {
      calls++;
      return route.fulfill({ json: { text: '请审阅计划', plan } });
    });
    await page.route('**/api/ai/assistant/plans/expired-guide', (route) =>
      route.fulfill({ json: plan }),
    );
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('帮我暂存');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.getByRole('button', { name: '确认执行计划', exact: true })).toBeDisabled();
    await panel.getByRole('button', { name: '重新准备计划', exact: true }).click();
    await expect(panel.getByRole('textbox', { name: '给 AI 助手的消息' })).toHaveValue(
      /请重新检查/,
    );
    expect(calls).toBe(1);
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
  } finally {
    await f.cleanup();
  }
});

test('规范页快捷引导复用真实表单且不请求助手接口', async ({ page }) => {
  let calls = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/ai/assistant')) calls++;
  });
  await page.goto('/design-system');
  const example = page
    .locator('.design-card')
    .filter({ has: page.getByRole('heading', { name: '回复快捷引导', exact: true }) });
  await example.getByRole('button', { name: '添加远端…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加远端', exact: true });
  await dialog.getByLabel('远端名称', { exact: true }).fill('demo');
  await dialog
    .getByLabel('远端地址或本机仓库路径', { exact: true })
    .fill('https://example.invalid/demo.git');
  await dialog.getByRole('button', { name: '添加远端', exact: true }).click();
  await expect(example.getByRole('button', { name: '发布分支…', exact: true })).toBeVisible();
  expect(calls).toBe(0);
});
