import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

test('跨仓库聊天先审阅再提交推送，刷新保留会话且不重放操作', async ({ page, request }) => {
  const f = await fixture();
  let sent = '';
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    sent = body;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: '计划已准备，请审阅后执行。',
                operations: [
                  { repositoryId: 'assistant-repo', type: 'stageAll' },
                  {
                    repositoryId: 'assistant-repo',
                    type: 'commit',
                    message: 'feat: assistant feature',
                  },
                  { repositoryId: 'assistant-repo', type: 'push' },
                ],
              }),
            },
          },
        ],
      }),
    );
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    const head = await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await git(f.repo, 'push', '-u', 'origin', 'main');
    await writeFile(path.join(f.repo, 'feature.txt'), 'private feature');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    await request.put('/api/ai/settings', {
      headers,
      data: { endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'demo', apiKey: '' },
    });
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'assistant-repo', name: '助手示例仓库', path: f.repo }];
    workspace.boards[0].nodes = [{ id: 'n', repoId: 'assistant-repo', position: { x: 0, y: 0 } }];
    await request.put('/api/workspace', { headers, data: workspace });
    await page.goto('/');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    const move = panel.getByRole('button', { name: '移动 AI 助手窗口' });
    await move.focus();
    const oldFrame = await panel.boundingBox();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await panel.boundingBox())!.x).toBe(oldFrame!.x - 10);
    await panel.getByRole('button', { name: '调整 AI 助手右下角' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await panel.boundingBox())!.width).toBe(oldFrame!.width - 10);
    await panel
      .getByRole('textbox', { name: '给 AI 助手的消息' })
      .fill('暂存所有改动，用 feat: assistant feature 提交并推送');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.getByRole('button', { name: '确认执行计划', exact: true })).toBeVisible();
    await panel.getByLabel('提交说明', { exact: true }).fill('feat: reviewed assistant feature');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
    expect(sent).not.toContain('private feature');
    expect(sent).not.toContain(f.repo);
    expect(JSON.parse(JSON.parse(sent).messages.at(-1).content)).not.toHaveProperty(
      'selectedBoard',
    );
    await panel.getByText('暂存全部改动', { exact: true }).click();
    await expect(panel.locator('.git-command-code').first()).toContainText('add --');
    await page.screenshot({ path: '.megit/verification/assistant/dark-plan.png' });
    await page.reload();
    await expect(panel.getByRole('button', { name: '确认执行计划', exact: true })).toBeVisible();
    await expect(panel.getByLabel('提交说明', { exact: true })).toHaveValue(
      'feat: reviewed assistant feature',
    );
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    await panel.getByRole('button', { name: '确认执行计划', exact: true }).click();
    await expect(panel.getByText('执行完成', { exact: true })).toBeVisible();
    expect(await git(f.repo, 'log', '-1', '--format=%s')).toBe('feat: reviewed assistant feature');
    const committed = await git(f.repo, 'rev-parse', 'HEAD');
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(committed);
    await page.reload();
    await expect(panel.getByText('执行完成', { exact: true })).toBeVisible();
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(committed);
    await panel.getByRole('button', { name: '新建对话', exact: true }).click();
    await expect(panel.getByText('让多个仓库一起向前', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '对话历史', exact: true }).click();
    await panel
      .getByRole('button', {
        name: '暂存所有改动，用 feat: assistant feature 提交并推送',
        exact: true,
      })
      .click();
    await expect(panel.getByText('执行完成', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('complementary', { name: 'MeGit AI assistant' })).toBeVisible();
    expect(
      await page
        .getByRole('complementary', { name: 'MeGit AI assistant' })
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: '.megit/verification/assistant/light-narrow.png' });
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await f.cleanup();
  }
});

test('助手配置保存后立即更新，停止生成保留草稿，范围帮助支持键盘', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'one', name: 'One', path: f.repo }];
    workspace.boards[0].nodes = [{ id: 'n', repoId: 'one', position: { x: 0, y: 0 } }];
    await request.put('/api/workspace', { headers, data: workspace });
    let configured = false;
    const saves: unknown[] = [];
    await page.route('**/api/ai/settings', async (route) => {
      if (route.request().method() === 'PUT') {
        configured = true;
        saves.push(route.request().postDataJSON());
      }
      await route.fulfill({
        json: configured
          ? {
              endpoint: 'https://example.invalid/v1/chat/completions',
              model: 'new-model',
              hasApiKey: true,
              projectDelivery: true,
            }
          : { endpoint: '', model: '', hasApiKey: false, projectDelivery: true },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    await expect(panel.getByRole('button', { name: '软件设置', exact: true })).toHaveCount(0);
    const quick = panel.getByRole('button', { name: 'AI 快捷设置', exact: true });
    await quick.click();
    const settings = page.getByRole('dialog', { name: 'AI 快捷设置' });
    await expect(settings.getByRole('checkbox', { name: '启用 AI 项目交付' })).toHaveCount(0);
    await settings.getByLabel('接口地址').fill('https://example.invalid/v1');
    await settings.getByLabel('模型', { exact: true }).fill('new-model');
    await settings.getByLabel('API Key', { exact: true }).fill('fake-api-key');
    await settings.getByRole('button', { name: '保存 AI 设置' }).click();
    await expect(settings.getByText('AI 设置已保存。')).toBeVisible();
    expect(saves).toEqual([
      { endpoint: 'https://example.invalid/v1', model: 'new-model', apiKey: 'fake-api-key' },
    ]);
    await expect(settings.getByLabel('API Key（已保存）', { exact: true })).toHaveValue('');
    await page.route('**/api/ai/test', (route) => route.fulfill({ json: { ok: true } }));
    await settings.getByRole('button', { name: '测试连接' }).click();
    await expect(settings.getByText('模型连接成功。')).toBeVisible();
    await settings.getByRole('button', { name: '关闭AI 快捷设置' }).click();
    await expect(quick).toBeFocused();
    await expect(panel.getByText('new-model', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '发送范围与能力' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('发送范围');
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: '发送范围与能力' }).click();
    await expect(panel.getByLabel('本次允许发送已暂存差异')).not.toBeChecked();
    await page.keyboard.press('Escape');
    const draft = panel.getByRole('textbox', { name: '给 AI 助手的消息' });
    const send = panel.getByRole('button', { name: '发送消息', exact: true });
    const scope = panel.getByRole('button', { name: '发送范围与能力' });
    const capability = panel.getByRole('button', { name: '默认范围', exact: true });
    const picker = panel.getByRole('button', { name: '选择引用内容' });
    await picker.click();
    await panel.getByRole('checkbox', { name: 'One', exact: true }).check();
    await page.keyboard.press('Escape');
    const composer = (await panel.locator('.assistant-composer').boundingBox())!;
    const sendBox = (await send.boundingBox())!;
    const draftBox = (await draft.boundingBox())!;
    const referencesBox = (await picker.boundingBox())!;
    const chipBox = (await panel
      .locator('.assistant-references')
      .getByText('One', { exact: true })
      .boundingBox())!;
    expect(sendBox.x + sendBox.width).toBe(composer.x + composer.width);
    expect(sendBox.y + sendBox.height).toBe(composer.y + composer.height);
    await expect(send.locator('svg')).toHaveCSS('width', '22px');
    await expect(capability).toHaveCSS('border-top-width', '0px');
    const footer = await Promise.all(
      [scope, capability, quick, send].map(async (button) => (await button.boundingBox())!),
    );
    for (const [index, box] of footer.entries()) {
      expect(box.y).toBeGreaterThanOrEqual(draftBox.y + draftBox.height);
      const previous = footer[index - 1];
      if (previous) expect(box.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
    expect(referencesBox.y + referencesBox.height).toBeLessThanOrEqual(draftBox.y);
    expect(referencesBox.x + referencesBox.width).toBeLessThanOrEqual(chipBox.x);
    expect(chipBox.y).toBeGreaterThanOrEqual(referencesBox.y);
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(referencesBox.y + referencesBox.height);
    await draft.fill('检查所选仓库');
    await panel
      .locator('.assistant-composer')
      .screenshot({ path: test.info().outputPath('composer-dark-zh.png') });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route('**/api/ai/assistant/chat', async (route) => {
      calls++;
      await gate;
      await route.fulfill({ json: { text: 'late response' } }).catch(() => undefined);
    });
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.getByRole('button', { name: '停止生成' })).toBeVisible();
    const stopBox = (await panel.getByRole('button', { name: '停止生成' }).boundingBox())!;
    expect(stopBox).toEqual(sendBox);
    await expect.poll(() => calls).toBe(1);
    await panel.getByRole('button', { name: '停止生成' }).click();
    await expect(draft).toHaveValue('检查所选仓库');
    await expect(draft).toBeEnabled();
    await expect(panel.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    release();
    await expect(panel.getByText('late response')).toHaveCount(0);
    expect(calls).toBe(1);
    await page.reload();
    await expect(draft).toHaveValue('检查所选仓库');
  } finally {
    await f.cleanup();
  }
});
