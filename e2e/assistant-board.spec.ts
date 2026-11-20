import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, expect } from './test';

test('无仓库流程图：审阅预览、刷新、整批应用、撤销与过期内容保护', async ({ page, request }) => {
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
                text: '已准备测试流程，请审阅。',
                operations: [],
                boardOperations: [
                  {
                    type: 'addStep',
                    id: 'test',
                    title: '检查测试结果',
                    text: 'npm test',
                    summary: '检查全部测试',
                    kind: 'decision',
                    position: { x: 160, y: 220 },
                  },
                  { type: 'updateConnection', id: 'start', target: 'test' },
                  { type: 'connect', id: 'pass', source: 'test', target: 'end', label: '通过' },
                  { type: 'arrange', direction: 'vertical' },
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
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const settings = await request.put('/api/ai/settings', {
      headers,
      data: { endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'flow-demo', apiKey: '' },
    });
    expect(settings.ok()).toBe(true);
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    Object.assign(workspace.boards[0], {
      notes: [
        { id: 'start', title: '开始', text: '', kind: 'start', position: { x: 80, y: 80 } },
        { id: 'end', title: '结束', text: '', kind: 'end', position: { x: 80, y: 420 } },
      ],
      connections: [{ id: 'start', source: 'start', target: 'end', label: '' }],
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    const readBoard = async () =>
      (await (await request.get('/api/workspace', { headers })).json()).boards[0];
    await page.goto('/');
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'MeGit AI 助手' });
    await expect(panel.getByRole('button', { name: '移除流程图引用', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '解读当前流程', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '补充测试流程', exact: true }).click();
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('补充测试及通过的流程');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    const plan = panel.getByRole('region', { name: '流程图修改计划' });
    await expect(plan.getByRole('button', { name: '确认应用到白板' })).toBeEnabled();
    await expect(plan.getByRole('img', { name: '修改后的流程预览' })).toBeVisible();
    await plan.getByText('查看具体修改', { exact: true }).first().click();
    await expect(plan.getByText('npm test', { exact: true })).toBeVisible();
    expect((await readBoard()).notes).toHaveLength(2);
    const context = JSON.parse(JSON.parse(sent).messages.at(-1).content);
    expect(context.selectedBoard.id).toBe(workspace.boards[0].id);
    expect(context.selectedBoard.connections[0].id).toBe('start');
    await plan.getByText('查看具体修改', { exact: true }).first().click();
    await plan.getByRole('img', { name: '修改后的流程预览' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.megit/verification/assistant/board-dark-review.png' });
    await page.reload();
    await expect(plan.getByRole('button', { name: '确认应用到白板' })).toBeEnabled();
    expect((await readBoard()).notes).toHaveLength(2);
    await plan.getByRole('button', { name: '确认应用到白板' }).click();
    await expect(
      plan.getByText('已应用到白板，可使用白板撤销恢复。保存状态见页面底部。'),
    ).toBeVisible();
    await expect.poll(async () => (await readBoard()).notes.length).toBe(3);
    expect((await readBoard()).connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'start', target: 'test' }),
        expect.objectContaining({ source: 'test', target: 'end', label: '通过' }),
      ]),
    );
    await page.getByRole('button', { name: '撤销白板编辑', exact: true }).click();
    await expect.poll(async () => (await readBoard()).notes.length).toBe(2);
    expect((await readBoard()).connections).toHaveLength(1);
    // Applied status remains consumed even after undo and reload.
    await page.reload();
    await expect(plan.getByRole('button', { name: '确认应用到白板' })).toHaveCount(0);
    expect((await readBoard()).notes).toHaveLength(2);
    await panel.getByRole('textbox', { name: '给 AI 助手的消息' }).fill('重新补充测试流程');
    await panel.getByRole('button', { name: '发送消息', exact: true }).click();
    const pending = panel.getByRole('button', { name: '确认应用到白板' });
    await expect(pending).toBeEnabled();
    // A local board edit during review invalidates the plan.
    await page.getByRole('button', { name: '锁定布局', exact: true }).click();
    await expect(pending).toBeDisabled();
    await expect(
      panel.getByText('流程图已变化或尚未保存，请检查当前白板后重新生成计划。'),
    ).toBeVisible();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Apply to whiteboard' })).toBeDisabled();
    expect(
      await page
        .getByRole('complementary', { name: 'MeGit AI assistant' })
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: '.megit/verification/assistant/board-light-narrow-stale.png' });
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('流程计划规范示例支持明暗、中英与窄屏，键盘确认只更新内存', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  await page.goto('/design-system');
  const plan = page.locator('.assistant-board-plan');
  await expect(plan.getByRole('img', { name: '修改后的流程预览' })).toBeVisible();
  await plan.screenshot({ path: '.megit/verification/assistant/board-example-dark.png' });
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(plan.getByRole('img', { name: 'Flowchart after changes' })).toBeVisible();
  expect(await plan.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await plan.screenshot({ path: '.megit/verification/assistant/board-example-light-narrow.png' });
  await plan.getByRole('button', { name: 'Apply to whiteboard' }).focus();
  await page.keyboard.press('Enter');
  await expect(plan.getByRole('status')).toContainText('Applied to the whiteboard');
  await expect(plan.getByRole('button', { name: 'Apply to whiteboard' })).toHaveCount(0);
  expect(requests).toEqual([]);
});
