import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from './test';

test('registers and edits a repository independently of the board', async ({ page }) => {
  const root = await mkdtemp(path.resolve('.megit', 'index-repo-'));
  execFileSync('git', ['init', root]);
  await page.goto('/');
  await page.getByRole('button', { name: '仓库管理', exact: true }).click();
  const categories = page.getByRole('dialog', { name: '仓库管理' }).getByRole('navigation');
  await expect(categories).toHaveCSS('flex-direction', 'column');
  await expect(categories.getByRole('button').locator('svg')).toHaveCount(2);
  await page.getByRole('button', { name: '登记仓库', exact: true }).click();
  await page.route('**/api/local-picker/folder', (route) =>
    route.fulfill({ json: { path: root } }),
  );
  await page.getByRole('button', { name: '浏览本地文件夹' }).click();
  await expect(page.getByLabel('仓库路径')).toHaveValue(root);
  await page.getByLabel('显示名称').fill('Index Demo');
  await page
    .getByRole('dialog', { name: '登记仓库' })
    .getByRole('button', { name: '登记仓库', exact: true })
    .click();
  const card = page.getByRole('article').filter({ hasText: 'Index Demo' });
  await expect(card).toBeVisible();
  const avatar = await card.locator('.repository-avatar').boundingBox();
  expect(avatar?.width).toBe(avatar?.height);
  expect(avatar?.width).toBeGreaterThanOrEqual(48);
  const boardAction = card.locator('.repository-index-title .repository-index-board-action');
  await expect(boardAction).toBeVisible();
  await expect(boardAction).toHaveText('');
  await expect(boardAction).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await card.getByRole('button', { name: '编辑仓库：Index Demo' }).click();
  await expect(page.getByLabel('仓库路径')).not.toBeEditable();
  await page.getByLabel('显示名称').fill('Renamed Demo');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed Demo' })).toBeVisible();
  const edit = page.getByRole('button', { name: '编辑仓库：Renamed Demo' });
  await edit.click();
  await page.getByRole('button', { name: '归档仓库', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.getByRole('button', { name: '归档', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('已保存');
  await page.reload();
  await expect(page.getByRole('button', { name: '归档', exact: true })).toHaveAttribute('aria-current', 'true');
  await edit.click();
  await page.getByRole('button', { name: '永久移除登记', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '永久移除登记' });
  const remove = confirm.getByRole('button', { name: '永久移除登记', exact: true });
  await expect(remove).toBeDisabled();
  await confirm.getByLabel('输入完整仓库显示名称').fill('Renamed Demo');
  await expect(remove).toBeDisabled();
  await confirm.getByRole('checkbox').check();
  await remove.click();
  await expect(edit).toHaveCount(0);
  expect(
    execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
    }).trim(),
  ).toBe('true');
});
