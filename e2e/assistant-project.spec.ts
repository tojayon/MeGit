import { createServer } from 'node:http';
import { once } from 'node:events';
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
    const output =
      calls.length === 1
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
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
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
      repositoryId: 'delivery-repo',
      repositoryPath: example.repo,
      endpoint: `${endpoint}/chat/completions`,
      model: 'delivery',
      prompt: '准备脚本',
      approved: true,
    };
    const disabled = await request.post('/api/ai/project/prepare', { headers, data: payload });
    expect((await disabled.json()).code).toBe('projectDisabled');
    expect((await request.post('/api/ai/project/prepare', { data: payload })).status()).toBe(403);
    expect(
      (
        await request.post('/api/ai/project/prepare', {
          headers,
          data: { ...payload, approved: false },
        })
      ).status(),
    ).toBe(400);
    await page.goto('/');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    await expect(panel.getByRole('button', { name: '项目交付', exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: '软件设置', exact: true }).click();
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
    await panel.getByRole('button', { name: '项目交付', exact: true }).click();
    await panel.getByLabel('目标仓库').selectOption('delivery-repo');
    await expect(panel.getByLabel('交付要求')).toHaveValue('生成本地启动脚本并配置启动设置');
    const prepare = panel.getByRole('button', { name: '授权并生成计划' });
    await expect(prepare).toBeDisabled();
    await panel.getByRole('checkbox', { name: /允许本次任务读取/ }).check();
    await prepare.click();
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
