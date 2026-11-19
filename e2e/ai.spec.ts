import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from './test';

test('configures the local AI service and adds a diagram only after confirmation', async ({
  page,
  request,
}) => {
  const requests: string[] = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(body);
    const content =
      requests.length === 1
        ? 'OK'
        : requests.length === 2
          ? 'One untracked change.'
          : JSON.stringify({
              nodes: [
                { title: 'AI Draft Start', kind: 'start' },
                { title: 'AI Draft End', kind: 'end' },
              ],
              edges: [{ source: 0, target: 1, label: '' }],
            });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const root = await mkdtemp(path.resolve('.megit', 'ai-test-repository-'));
    execFileSync('git', ['init', root]);
    await writeFile(path.join(root, 'private-filename.txt'), 'private-file-content');
    const session = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': session.token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'demo-repository', name: 'Private Repository', path: root }];
    workspace.boards[0].nodes = [
      { id: 'demo-node', repoId: 'demo-repository', position: { x: 0, y: 0 } },
    ];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await expect(page.getByLabel('接口地址')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭偏好设置' }).click();
    await page.getByRole('button', { name: '软件设置', exact: true }).click();
    await page.getByLabel('接口地址').fill(`http://127.0.0.1:${address.port}/v1`);
    await page.getByLabel('模型', { exact: true }).fill('mock-model');
    await page.getByLabel('API Key', { exact: true }).fill('isolated-test-key');
    await page.getByRole('button', { name: '保存 AI 设置' }).click();
    await expect(page.getByText('AI 设置已保存。')).toBeVisible();
    await expect(page.getByLabel('API Key（已保存）')).toHaveValue('');
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.getByText('模型连接成功。')).toBeVisible();
    expect(requests[0]).not.toContain('isolated-test-key');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    await page.getByLabel('本次引用的仓库').selectOption('demo-repository');
    await page.getByRole('button', { name: '解读状态' }).click();
    await expect(page.getByText('One untracked change.')).toBeVisible();
    expect(JSON.parse(JSON.parse(requests[1]).messages[1].content)).toEqual({
      changed: 1,
      staged: 0,
      ahead: null,
      behind: null,
      detached: false,
      hasCommit: false,
      conflicts: 0,
    });
    await page.getByRole('button', { name: '关闭软件设置' }).click();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
    await page
      .getByLabel('Workflow description to send to the provider')
      .fill('Make a short workflow');
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByRole('region', { name: 'Draft preview' })).toBeVisible();
    await expect(
      page.locator('.react-flow__node').filter({ hasText: 'AI Draft Start' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm and add to board' }).click();
    await expect(page.getByText('The flowchart draft was added to the board.')).toBeVisible();
    await page.getByRole('button', { name: 'Close Settings' }).click();
    await expect(
      page.locator('.react-flow__node').filter({ hasText: 'AI Draft Start' }),
    ).toHaveCount(1);
  } finally {
    upstream.close();
  }
});

test('opens categorized software settings from the narrow navigation drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开流程导航', exact: true }).click();
  const navigation = page.locator('#workspace-navigation');
  const opener = navigation.getByRole('button', { name: '软件设置', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '软件设置' });
  await expect(dialog.getByRole('button', { name: 'AI 服务', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await dialog.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'AI 助手', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
