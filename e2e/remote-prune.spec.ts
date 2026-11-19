import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const english of [false, true]) {
  test(`获取清理远端标签并保留本地分支和合并曲线 · ${english ? 'light/en' : 'dark/zh'}`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      await git(f.repo, 'switch', '-c', 'feature/completed');
      const feature = await commitFile(f.repo, 'feature.txt');
      await git(f.repo, 'switch', 'main');
      await commitFile(f.repo, 'main.txt');
      await git(f.repo, 'merge', '--no-ff', 'feature/completed', '-m', 'merge completed feature');
      const head = await git(f.repo, 'rev-parse', 'HEAD');
      const remote = path.join(f.root, 'remote.git');
      await git(f.root, 'init', '--bare', remote);
      await git(f.repo, 'remote', 'add', 'origin', remote);
      await git(f.repo, 'push', '-u', 'origin', 'main');
      await git(f.repo, 'push', 'origin', 'feature/completed');
      await git(remote, 'update-ref', '-d', 'refs/heads/feature/completed');
      await writeFile(path.join(f.repo, 'untracked.txt'), 'keep local work\n');

      const { token } = await (await request.get('/api/session')).json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      workspace.repositories = [{ id: 'prune', name: 'Remote test', path: f.repo }];
      workspace.boards[0].nodes = [{ id: 'node', repoId: 'prune', position: { x: 80, y: 100 } }];
      expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
      await page.addInitScript((en) => {
        localStorage.setItem(
          'megit.preferences',
          JSON.stringify({
            version: 1,
            language: en ? 'en' : 'zh-CN',
            theme: en ? 'light' : 'dark',
            inspectorWidth: 800,
          }),
        );
      }, english);
      await page.goto('/');
      await page
        .getByRole('button', { name: `${english ? 'View ' : '查看'}Remote test`, exact: true })
        .click();
      const tools = page.getByRole('button', {
        name: english ? 'Branch tree tools' : '分支树工具',
        exact: true,
      });
      await tools.click();
      await page
        .getByRole('button', {
          name: english ? 'Show remote branches' : '显示远端分支',
          exact: true,
        })
        .click();
      const stale = page.locator('[data-ref="refs/remotes/origin/feature/completed"]');
      await expect(stale).toHaveCount(1);
      await tools.click();
      await page
        .getByRole('button', { name: english ? 'Refresh status' : '刷新状态', exact: true })
        .click();
      await expect(stale).toHaveCount(1);

      await tools.click();
      const fetch = page.getByRole('button', { name: english ? 'Fetch' : '获取', exact: true });
      await fetch.hover();
      const hint = page.getByRole('tooltip');
      await expect(hint).toContainText('--prune');
      await expect(hint).toContainText(english ? 'deleted on the remote' : '远端已删除');
      await page.keyboard.press('Escape');
      // Reproduce the exact single-branch clone configuration, then explicitly repair it.
      await git(
        f.repo,
        'config',
        '--replace-all',
        'remote.origin.fetch',
        '+refs/heads/feature/completed:refs/remotes/origin/feature/completed',
      );
      const failed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/repositories/prune/actions') &&
          response.request().method() === 'POST',
      );
      await fetch.click();
      expect((await failed).status()).toBe(422);
      await expect(
        page
          .getByText(
            english
              ? /A remote branch specified by the fetch rules no longer exists/
              : /获取规则指定的远端分支已不存在/,
          )
          .first(),
      ).toBeVisible();
      await expect(stale).toHaveCount(1);
      await git(
        f.repo,
        'config',
        '--replace-all',
        'remote.origin.fetch',
        '+refs/heads/*:refs/remotes/origin/*',
      );
      await tools.click();
      await fetch.click();
      await expect(stale).toHaveCount(0);
      await expect(page.locator('[data-ref="refs/heads/feature/completed"]')).toHaveCount(1);
      await expect(page.locator('[data-ref="refs/remotes/origin/main"]')).toHaveCount(1);
      await expect(page.locator(`[data-commit="${feature}"]`)).toHaveCount(1);
      await expect(page.locator('.tree-edge[data-merge="true"]')).toHaveCount(1);
      expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
      expect(await git(f.repo, 'status', '--porcelain')).toContain('?? untracked.txt');
      await page.screenshot({
        path: `.megit/verification/remote-prune/${english ? 'light-en' : 'dark-zh'}.png`,
      });
    } finally {
      await f.cleanup();
    }
  });
}
