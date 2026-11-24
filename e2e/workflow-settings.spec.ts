import { test, expect } from './test';

test('工作流设置统一编辑名称和说明，并且只更新当前工作流', async ({ page, request }) => {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const read = async () => (await request.get('/api/workspace', { headers })).json();
  const original = await read();
  original.boards.push({ id: 'other', name: '其他流程', description: '原有说明', nodes: [], edges: [] });
  expect((await request.put('/api/workspace', { headers, data: original })).ok()).toBe(true);
  const saved = await read();
  await page.goto('/');
  const settings = page.getByRole('button', { name: '工作流设置', exact: true });
  await expect(settings).toHaveCount(1);
  await expect(page.getByRole('button', { name: '工作流选项', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '白板详情', exact: true })).toHaveCount(0);
  await settings.click();
  const dialog = page.getByRole('dialog', { name: '工作流设置', exact: true });
  await expect(dialog.getByRole('button', { name: '移除工作流', exact: true })).toBeVisible();
  await dialog.getByLabel('工作流名称').fill('发布白板');
  await dialog.getByLabel('工作流说明').fill('保留我输入的原文');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(async () => (await read()).boards[0].name).toBe('发布白板');
  expect((await read()).boards).toEqual([
    { ...saved.boards[0], name: '发布白板', description: '保留我输入的原文' },
    saved.boards[1],
  ]);
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await expect(page.getByRole('tab', { name: '发布白板', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await settings.click();
  await expect(dialog.getByLabel('工作流说明')).toHaveValue('保留我输入的原文');
});

test('设计规范复用工作流设置，修改只作用于示例', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/design-system');
  await page.getByRole('button', { name: '工作流设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '工作流设置', exact: true });
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await dialog.getByLabel('工作流名称').fill('示例工作流');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '示例工作流', exact: true })).toBeVisible();
  expect(apiRequests).toEqual([]);
});
