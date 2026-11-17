import { test, expect } from './test';
import { fixture, commitFile } from '../tests/fixtures';

test('低窗口的长 Git 帮助支持键盘滚动、内部聚焦和 Escape 返回入口', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'keyboard', name: '键盘测试', path: f.repo }];
    Object.assign(workspace.boards[0], {
      nodes: [{ id: 'keyboard-node', repoId: 'keyboard', position: { x: 80, y: 260 } }],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'dark', language: 'en', navigationCollapsed: true }),
      ),
    );
    await page.setViewportSize({ width: 760, height: 500 });
    await page.goto('/');
    await page.getByRole('button', { name: 'View 键盘测试', exact: true }).click();
    const repo = page.getByRole('complementary', {
      name: '键盘测试 repository details',
      exact: true,
    });
    await repo.getByRole('button', { name: 'View branch main', exact: true }).click();
    const help = repo.getByRole('button', { name: 'About Synchronization status', exact: true });
    await help.focus();
    await help.press('Enter');
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    expect(await tooltip.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await help.press('End');
    await expect
      .poll(() => tooltip.evaluate((element) => Math.round(element.scrollTop)))
      .toBeGreaterThan(0);
    await expect(tooltip.getByText('Push', { exact: true })).toBeInViewport();
    await expect(help).toBeFocused();
    await help.press('Home');
    await expect.poll(() => tooltip.evaluate((element) => element.scrollTop)).toBe(0);
    await help.press('PageDown');
    await expect.poll(() => tooltip.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await tooltip.focus();
    await expect(tooltip).toBeFocused();
    await expect(tooltip).toBeVisible();
    await page.screenshot({ path: '.megit/verification/git-help/help-dark-en-short.png' });
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(help).toBeFocused();
    await expect(repo).toBeVisible();
  } finally {
    await f.cleanup();
  }
});
