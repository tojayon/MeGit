import { test, expect } from './test';
import { fixture } from '../tests/fixtures';

test('关闭详情后恢复入口焦点，但不抢走已转到画布的键盘焦点', async ({ page, request }) => {
  const f = await fixture();
  try {
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'repo', name: '焦点测试仓库', path: f.repo }];
    workspace.boards[0].nodes = [{ id: 'repo-node', repoId: 'repo', position: { x: 80, y: 100 } }];
    workspace.boards[0].viewport = { x: 15, y: 20, zoom: 0.7 };
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    const open = page.getByRole('button', { name: '查看焦点测试仓库', exact: true });
    const close = page.getByRole('button', { name: '关闭仓库详情', exact: true });
    await open.click();
    await close.click();
    await expect(page.locator('[data-details-trigger]')).toBeFocused();

    await open.click();
    await expect(close).toBeVisible();
    // Choose the next focus target before the deferred restoration runs.
    const retained = await page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="关闭仓库详情"]')!.click();
      const target = document.querySelector<HTMLElement>('.react-flow__node[data-id="repo-node"]')!;
      target.focus();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return document.activeElement === target;
    });
    expect(retained).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/workspace', { headers })).json()).boards[0].nodes[0]
            .position.x,
      )
      .toBe(90);
  } finally {
    await f.cleanup();
  }
});
