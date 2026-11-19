import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { selectBranch } from './branch-tree-helpers';
import path from 'node:path';

for (const english of [false, true]) {
  test(`explicit remote actions · ${english ? 'light/en' : 'dark/zh'}`, async ({ page, request }) => {
    const sample = await fixture();
    try {
      const head = await commitFile(sample.repo);
      const remote = path.join(sample.root, 'remote.git');
      await git(sample.root, 'init', '--bare', remote);
      await git(sample.repo, 'push', remote, 'HEAD:refs/heads/occupied');
      const { token } = await (await request.get('/api/session')).json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      workspace.repositories = [{ id: 'remote-actions', name: 'Remote actions', path: sample.repo }];
      workspace.boards[0].nodes = [{ id: 'node', repoId: 'remote-actions', position: { x: 80, y: 100 } }];
      expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
      await page.addInitScript((en) => {
        localStorage.setItem('megit.preferences', JSON.stringify({
          version: 1, language: en ? 'en' : 'zh-CN', theme: en ? 'light' : 'dark', inspectorWidth: 800,
        }));
      }, english);
      await page.goto('/');
      await page.getByRole('button', { name: english ? 'View Remote actions' : '查看Remote actions', exact: true }).click();
      await selectBranch(page, 'main', english);
      const sync = page.getByRole('group', { name: english ? 'Branch sync' : '分支同步', exact: true });
      const publish = english ? 'Publish branch' : '发布分支';
      const tracking = english ? 'Set upstream' : '设置跟踪';
      const add = english ? 'Add remote' : '添加远端';
      const manage = english ? 'Manage remotes' : '远端管理';
      const remoteBranch = english ? 'Remote branch' : '远端分支';
      await expect(sync.getByRole('button', { name: `${publish}…` })).toHaveCount(0);
      await page.getByRole('button', { name: manage, exact: true }).click();
      const empty = page.getByRole('dialog', { name: manage, exact: true });
      await expect(empty.locator('.remote-management-empty')).toBeVisible();
      await expect(empty.locator('footer').getByRole('button', {
        name: english ? 'Fetch all remotes' : '获取全部远端', exact: true,
      })).toBeDisabled();
      await page.getByRole('button', { name: `${add}…`, exact: true }).click();
      const addDialog = page.getByRole('dialog', { name: add, exact: true });
      await addDialog.getByLabel(english ? 'Remote name' : '远端名称', { exact: true }).fill('origin');
      await addDialog.getByLabel(english ? 'Remote address or local repository path' : '远端地址或本机仓库路径').fill(remote);
      await addDialog.getByRole('button', { name: add, exact: true }).click();
      await expect(addDialog).toHaveCount(0);
      expect(await git(sample.repo, 'for-each-ref', 'refs/remotes')).toBe('');

      await git(sample.repo, 'remote', 'add', 'github', 'https://github.com/example/repository.git');
      await page.reload();
      const manageButton = page.getByRole('button', { name: manage, exact: true });
      await manageButton.click();
      const management = page.getByRole('dialog', { name: manage, exact: true });
      const localRow = management.getByRole('listitem').filter({ hasText: 'origin' });
      const githubRow = management.getByRole('listitem').filter({ hasText: 'github' });
      const loginLabel = english ? 'Sign in to GitHub' : '登录 GitHub';
      await expect(management.locator('header')).toContainText(english ? '2 remotes' : '2 个远端');
      await expect(localRow.getByRole('heading', { name: 'origin' })).toBeVisible();
      await expect(localRow.getByRole('status')).toHaveText(english ? 'Not checked' : '未检查');
      await expect(localRow.getByRole('button', { name: `${loginLabel}…`, exact: true })).toHaveCount(0);
      await localRow.getByRole('button', { name: english ? 'Check read access' : '检查读取访问' }).click();
      await expect(localRow.getByRole('status')).toHaveText(english ? 'Readable' : '可读取');
      await expect(localRow).toContainText(english ? 'Push access not checked' : '未检查推送权限');
      await expect(githubRow.getByRole('button', { name: `${loginLabel}…`, exact: true })).toBeVisible();
      await management.screenshot({
        path: `.megit/verification/remote-management/${english ? 'light-en' : 'dark-zh'}.png`,
      });
      expect(await git(sample.repo, 'for-each-ref', 'refs/remotes')).toBe('');
      await expect(git(sample.repo, 'rev-parse', '--verify', 'FETCH_HEAD')).rejects.toThrow();

      const authorizationRequests: unknown[] = [];
      await page.route('**/api/repositories/remote-actions/remote-access', async (route) => {
        authorizationRequests.push(route.request().postDataJSON());
        await route.fulfill({ json: { completed: true } });
      });
      await githubRow.getByRole('button', { name: `${loginLabel}…`, exact: true }).click();
      const login = page.getByRole('dialog', { name: loginLabel, exact: true });
      await expect(login).toBeVisible();
      expect(authorizationRequests).toEqual([]);
      await login.getByRole('button', { name: english ? 'Authorize in browser' : '打开浏览器授权' }).click();
      await expect(login.getByRole('status')).toContainText(english ? 'completed the sign-in' : '已完成登录操作');
      expect(authorizationRequests).toEqual([{ name: 'github', action: 'githubLogin' }]);
      await login.getByRole('button', { name: english ? 'Done' : '完成' }).click();
      await git(sample.repo, 'remote', 'remove', 'github');
      await page.reload();
      if (!(await sync.isVisible())) {
        const open = page.getByRole('button', { name: english ? 'View Remote actions' : '查看Remote actions', exact: true });
        if (await open.isVisible() && !(await manageButton.isVisible())) await open.click();
        await selectBranch(page, 'main', english);
      }

      await sync.getByRole('button', { name: `${publish}…`, exact: true }).click();
      const publishDialog = page.getByRole('dialog', { name: publish, exact: true });
      const branchName = publishDialog.getByLabel(remoteBranch, { exact: true });
      await expect(branchName).toHaveValue('main');
      await branchName.fill('occupied');
      await publishDialog.getByRole('button', { name: publish, exact: true }).click();
      await expect(publishDialog.getByRole('alert')).toContainText(english ? 'already exists' : '已存在，未发布');
      await branchName.fill('features/new');
      await publishDialog.getByRole('button', { name: publish, exact: true }).click();
      await expect(publishDialog).toHaveCount(0);
      await expect(page.getByText(english ? /Created origin\/features\/new without setting an upstream/ : /已创建 origin\/features\/new，未设置跟踪/)).toBeVisible();
      expect(await git(remote, 'rev-parse', 'refs/heads/features/new')).toBe(head);
      await expect(sync.getByRole('button', { name: english ? 'Push' : '推送', exact: true })).toHaveCount(0);

      await sync.getByRole('button', { name: `${tracking}…`, exact: true }).click();
      const trackingDialog = page.getByRole('dialog', { name: tracking, exact: true });
      await trackingDialog.getByLabel(remoteBranch, { exact: true }).selectOption('origin/features/new');
      await trackingDialog.getByRole('button', { name: tracking, exact: true }).click();
      await expect(trackingDialog).toHaveCount(0);
      await expect(sync.getByText(english ? /Tracking origin\/features\/new/i : /跟踪 origin\/features\/new/)).toBeVisible();
      await expect(sync.getByRole('button', { name: english ? 'Push' : '推送', exact: true })).toBeEnabled();
    } finally {
      await sample.cleanup();
    }
  });
}

test('远端管理示例在窄屏可滚动，底部操作常显', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 540 });
  await page.goto('/design-system');
  const example = page.locator('.design-remote-management-example');
  const trigger = example.getByRole('button', { name: '远端管理', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeInViewport();
  await trigger.click();
  const panel = page.getByRole('dialog', { name: '远端管理', exact: true });
  await expect(panel).toBeInViewport({ ratio: 1 });
  const footer = panel.locator('footer');
  await expect(footer.getByRole('button', { name: '获取全部远端', exact: true })).toBeInViewport();
  await expect(footer.getByRole('button', { name: '添加远端…', exact: true })).toBeInViewport();
  const list = panel.getByRole('list');
  await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const footerBox = await footer.boundingBox();
  await list.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(panel.getByRole('alert')).toBeInViewport();
  expect(await footer.boundingBox()).toEqual(footerBox);
  await page.screenshot({ path: '.megit/verification/remote-management/narrow-dark.png' });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
