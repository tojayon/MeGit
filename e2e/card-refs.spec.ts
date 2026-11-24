import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

test('同仓库分支卡片各自代表自己的引用，工作区操作跟随实际检出', async ({ page, request }) => {
  const fixtureRepo = await fixture();
  try {
    await commitFile(fixtureRepo.repo);
    await git(fixtureRepo.repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    await git(fixtureRepo.repo, 'branch', 'dev');
    await commitFile(fixtureRepo.repo, 'ahead.txt', 'ahead');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    const board = workspace.boards[0];
    board.nodes = [
      { id: 'remote', repoId: 'repo', ref: 'refs/remotes/origin/main', position: { x: 0, y: 0 } },
      { id: 'local', repoId: 'repo', ref: 'refs/heads/main', position: { x: 550, y: 0 } },
      { id: 'dev', repoId: 'repo', ref: 'refs/heads/dev', position: { x: 550, y: 300 } },
    ];
    board.edges = [
      { id: 'compare', source: 'remote', target: 'local', kind: 'integration', label: '' },
    ];
    workspace.repositories = [{ id: 'repo', name: 'MeWiki', path: fixtureRepo.repo }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.setViewportSize({ width: 1500, height: 1050 });
    await page.goto('/');
    const remote = page.locator('.react-flow__node[data-id="remote"]');
    const local = page.locator('.react-flow__node[data-id="local"]');
    const dev = page.locator('.react-flow__node[data-id="dev"]');
    await expect(remote.locator('.repository-card-branch')).toHaveText('origin/main');
    await expect(remote.locator('.repository-card-actions')).toHaveCount(0);
    await expect(dev.locator('.repository-card-actions')).toHaveCount(0);
    await expect(local.locator('.repository-card-actions')).toHaveCount(1);
    await expect(
      page.locator('[data-edge-id="compare"]').filter({ hasText: '目标领先 1' }),
    ).toBeVisible();
    await remote.locator('.repository-avatar').click();
    await expect(remote).toHaveClass(/\bselected\b/);
    await expect(page.locator('.repository-inspector')).toHaveCount(0);
    const branchTree = page.waitForRequest(
      (entry) => new URL(entry.url()).searchParams.get('base') === 'refs/remotes/origin/main',
    );
    const openRemote = remote
      .getByRole('heading', { name: 'MeWiki' })
      .getByRole('button', { name: '查看MeWiki · origin/main' });
    await openRemote.click();
    await branchTree;
    await expect(page.locator('.repository-inspector')).toContainText('MeWiki · origin/main');
    await expect(
      page.locator('.tree-tip.on-trunk[data-ref="refs/remotes/origin/main"]'),
    ).toBeVisible();
    await local.locator('.repository-avatar').click();
    await expect(local).toHaveClass(/\bselected\b/);
    await expect(page.locator('.repository-inspector')).toContainText('MeWiki · origin/main');
    await git(fixtureRepo.repo, 'switch', 'dev');
    await page.reload();
    await expect(dev.locator('.repository-card-actions')).toHaveCount(1);
    await expect(local.locator('.repository-card-actions')).toHaveCount(0);
    const stale = await request.post(
      '/api/repositories/repo/actions?worktreeRef=refs%2Fheads%2Fmain',
      { headers, data: { type: 'commit', message: 'must not commit' } },
    );
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'branchStateChanged' });
    await git(fixtureRepo.repo, 'update-ref', '-d', 'refs/remotes/origin/main');
    await page.reload();
    await expect(remote).toContainText('绑定的分支已不可用');
    await expect(remote.locator('.repository-card-actions')).toHaveCount(0);
    await openRemote.click();
    await expect(page.locator('.repository-inspector .panel-error')).toBeVisible();
    await page.getByRole('button', { name: '绑定卡片分支', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '绑定卡片分支' });
    await dialog.getByRole('combobox').selectOption('');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(remote.locator('.repository-card-branch')).toHaveText('dev');
    await expect(remote.locator('.repository-card-actions')).toHaveCount(1);
    await git(fixtureRepo.repo, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
    await page.getByRole('button', { name: '添加仓库', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '添加本地仓库' });
    await add.getByRole('button', { name: 'MeWiki', exact: true }).click();
    await add.getByLabel('卡片显示名称').fill('MeWiki 文档库');
    await add.getByRole('button', { name: '添加到工作流', exact: true }).click();
    await dialog.getByRole('combobox').selectOption('refs/remotes/origin/main');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByTestId('repository-node')).toHaveCount(4);
    const renamedCards = page
      .getByTestId('repository-node')
      .getByRole('heading', { name: 'MeWiki 文档库', exact: true });
    await expect(renamedCards).toHaveCount(1);
    await expect(
      page.locator('.repository-inspector').filter({ hasText: 'MeWiki 文档库 · origin/main' }),
    ).toBeVisible();
    await expect(local.getByRole('heading', { name: 'MeWiki', exact: true })).toBeVisible();
    await expect(
      page.locator('.repository-card-branch').filter({ hasText: 'origin/main' }),
    ).toBeVisible();
    await expect(page.locator('.save-state')).toHaveText('已保存');
    await page.reload();
    await expect(renamedCards).toHaveCount(1);
    await expect(local.getByRole('heading', { name: 'MeWiki', exact: true })).toBeVisible();
  } finally {
    await fixtureRepo.cleanup();
  }
});
