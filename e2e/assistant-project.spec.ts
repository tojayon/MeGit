import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

test('在现有助手中授权读取、预览文件、写入及配置信任，不启动项目', async ({ page, request }) => {
  test.skip(process.platform !== 'win32');
  const example = await fixture();
  const entry = 'scripts/start.ps1';
  const content = "Write-Error 'This fixture must not run'\nexit 1\n";
  const calls: string[] = [];
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    calls.push(raw);
    const messages = JSON.parse(raw).messages.map(
      (message: { content: string }) => message.content,
    );
    const output = messages.some((message: string) => message.includes('新增验收环节'))
      ? {
          text: '已准备工作流修改',
          operations: [],
          boardOperations: [
            {
              type: 'addStep',
              id: 'review-step',
              title: '验收环节',
              text: '',
              summary: '',
              kind: 'process',
              position: { x: 260, y: 80 },
            },
          ],
        }
      : !messages.some((message: string) => message.startsWith('{"fileData":'))
        ? { read: ['README.md'] }
        : {
            summary: '已准备启动脚本',
            files: [
              { path: entry, content },
              { path: 'README.md', content: 'Updated docs\n' },
            ],
            service: { directory: '.', kind: 'powershell', entry, port: 8090 },
          };
    res.setHeader('Content-Type', 'application/json');
    const reply = messages.at(-1)?.includes('默认范围文件提案')
      ? { summary: '不可应用', files: [{ path: 'scripts/forbidden.ps1', content }] }
      : output;
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('No fixture port');
    const head = await commitFile(example.repo, 'README.md', 'Original docs\n');
    await mkdir(path.join(example.repo, 'scripts'));
    await writeFile(path.join(example.repo, '.env'), 'PRIVATE=never-send-me');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const endpoint = `http://127.0.0.1:${address.port}/v1`;
    const settings = '/api/ai/settings';
    expect(
      (await request.put(settings, { headers, data: { endpoint, model: 'delivery' } })).ok(),
    ).toBe(true);
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'delivery-repo', name: '示例 Wiki', path: example.repo }];
    workspace.boards[0].nodes = [
      { id: 'delivery-head', repoId: 'delivery-repo', position: { x: 60, y: 80 } },
    ];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    const payload = {
      conversationId: randomUUID(),
      repositoryId: 'delivery-repo',
      repositoryPath: example.repo,
      endpoint: `${endpoint}/chat/completions`,
      model: 'delivery',
      approved: true,
    };
    const disabled = await request.post('/api/ai/project/grants', { headers, data: payload });
    expect((await disabled.json()).code).toBe('projectDisabled');
    expect((await request.post('/api/ai/project/grants', { data: payload })).status()).toBe(403);
    expect(
      (
        await request.post('/api/ai/project/grants', {
          headers,
          data: { ...payload, approved: false },
        })
      ).status(),
    ).toBe(400);
    await page.goto('/');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '软件设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '软件设置' });
    const enable = dialog.getByRole('checkbox', { name: '启用 AI 项目交付' });
    await expect(enable).not.toBeChecked();
    await enable.check();
    await dialog.getByRole('button', { name: '保存 AI 设置' }).click();
    await expect(dialog.getByText('AI 设置已保存。')).toBeVisible();
    await dialog.getByRole('button', { name: '关闭软件设置' }).click();
    await panel
      .getByRole('textbox', { name: '给 AI 助手的消息' })
      .fill('生成本地启动脚本并配置启动设置');
    await panel.getByRole('button', { name: '取消引用 示例 Wiki' }).click();
    await panel.getByRole('button', { name: '默认范围', exact: true }).click();
    const scope = panel.getByRole('dialog', { name: 'AI 能力范围' });
    await expect(scope.getByRole('combobox')).toHaveCount(0);
    await expect(scope.getByRole('button', { name: '仓库读写', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: '选择引用内容', exact: true }).click();
    await panel.getByRole('checkbox', { name: '示例 Wiki' }).check();
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: '默认范围', exact: true }).click();
    await scope.getByRole('button', { name: '了解更多', exact: true }).click();
    const permissionDetails = panel.getByRole('dialog', { name: 'AI 能力范围说明' });
    await expect(permissionDetails).toContainText('127.0.0.1');
    await expect(permissionDetails).toContainText('示例 Wiki');
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeFocused();
    await panel.getByRole('button', { name: '默认范围', exact: true }).click();
    expect(calls).toHaveLength(0);
    await scope.getByRole('button', { name: '仓库读写', exact: true }).click();
    await expect(panel.getByRole('button', { name: '仓库读写：示例 Wiki' })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: '给 AI 助手的消息' })).toHaveValue(
      '生成本地启动脚本并配置启动设置',
    );
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    const plan = panel.getByRole('region', { name: '审阅项目变更' });
    await expect(plan).toBeFocused();
    await plan.getByText('README.md', { exact: true }).last().click();
    await expect(plan.getByText('Original docs')).toBeVisible();
    await expect(plan.getByText('Updated docs')).toBeVisible();
    await expect(panel.getByRole('button', { name: '保存文件并配置' })).toBeDisabled();
    expect(calls).toHaveLength(2);
    expect(calls.join()).not.toMatch(/never-send-me|\.env/);
    await expect(readFile(path.join(example.repo, entry))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readFile(path.join(example.repo, 'README.md'), 'utf8')).toBe('Original docs\n');
    await plan.getByRole('checkbox', { name: /我已审阅并信任启动入口/ }).check();
    await plan.getByRole('button', { name: '保存文件并配置' }).click();
    await expect(panel.getByText('启动配置已保存，服务未启动。')).toBeVisible();
    const saved = await request.get('/api/repositories/delivery-repo/local-service', { headers });
    expect(await saved.json()).toMatchObject({
      status: 'stopped',
      config: { entry, port: 8090 },
      log: '',
    });
    expect(await readFile(path.join(example.repo, entry), 'utf8')).toBe(content);
    expect(await git(example.repo, 'rev-parse', 'HEAD')).toBe(head);
    await panel.getByRole('button', { name: '选择引用内容', exact: true }).click();
    await panel.getByRole('checkbox', { name: /当前流程图/ }).check();
    await page.keyboard.press('Escape');
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('新增验收环节');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(panel.getByRole('button', { name: '确认应用到工作流' })).toBeEnabled();
    await panel.getByRole('button', { name: '确认应用到工作流' }).click();
    await expect(
      panel.getByText('已应用到工作流，可使用工作流撤销恢复。保存状态见页面底部。'),
    ).toBeVisible();
    await panel.getByRole('button', { name: '新建对话', exact: true }).click();
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '对话历史', exact: true }).click();
    await panel
      .getByRole('button', { name: '生成本地启动脚本并配置启动设置', exact: true })
      .click();
    const activePermission = panel.getByRole('button', { name: '仓库读写：示例 Wiki' });
    await expect(activePermission).toBeVisible();
    await activePermission.click();
    await scope.getByRole('button', { name: '默认范围', exact: true }).click();
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '默认范围', exact: true }).click();
    await scope.getByRole('button', { name: '仓库读写', exact: true }).click();
    await expect(activePermission).toBeVisible();
    await panel.getByRole('button', { name: '取消引用 示例 Wiki' }).click();
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '选择引用内容', exact: true }).click();
    await panel.getByRole('checkbox', { name: '示例 Wiki' }).check();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: '默认范围', exact: true })).toBeVisible();
    const totalCalls = calls.length;
    const invalidGrant = await request.post('/api/ai/assistant/chat', {
      headers,
      data: {
        prompt: '生成脚本',
        repositoryIds: ['delivery-repo'],
        language: 'zh-CN',
        projectGrant: { id: randomUUID(), conversationId: payload.conversationId },
      },
    });
    expect((await invalidGrant.json()).code).toBe('projectPermission');
    expect(calls).toHaveLength(totalCalls);
    const withoutGrant = await request.post('/api/ai/assistant/chat', {
      headers,
      data: { prompt: '默认范围文件提案', repositoryIds: ['delivery-repo'], language: 'zh-CN' },
    });
    expect((await withoutGrant.json()).code).toBe('assistantOutput');
    expect(calls.at(-1)).not.toContain('writableRepository');
    await expect(readFile(path.join(example.repo, 'scripts/forbidden.ps1'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText('Startup configuration saved. The service was not started.'),
    ).toBeVisible();
    expect(
      await page
        .getByRole('complementary', { name: 'MeGit AI assistant' })
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  } finally {
    upstream.close();
    await once(upstream, 'close');
    await example.cleanup();
  }
});
