import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('待推送默认亮蓝色，确认按钮显示同款图标；同步后不可执行', async ({ page, request }) => {
  const { root, repo, cleanup } = await fixture();
  try {
    const remote = path.join(root, 'release.git');
    await mkdir(remote);
    await git(remote, 'init', '--bare');
    const initial = await commitFile(repo);
    await git(repo, 'remote', 'add', 'origin', remote);
    await git(repo, 'push', '-u', 'origin', 'main');
    const head = await commitFile(repo, 'release.txt', 'release');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'repo', name: 'MeWiki', path: repo }];
    Object.assign(workspace.boards[0], {
      nodes: [
        { id: 'a', repoId: 'repo', displayName: '开发', ref: 'refs/heads/main', position: { x: 0, y: 0 } },
        { id: 'b', repoId: 'repo', displayName: '发布', ref: 'refs/remotes/origin/main', position: { x: 620, y: 0 } },
      ],
      edges: [{ id: 'sync', source: 'a', target: 'b', kind: 'integration', label: '' }],
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    const bridge = page.locator('.repository-relation-label');
    await expect(bridge).toHaveText('目标落后 1');
    const push = page.getByRole('button', { name: '推送: 开发 · main → 发布 · origin/main', exact: true });
    const pull = page.getByRole('button', { name: '拉取: 发布 · origin/main → 开发 · main', exact: true });
    const pushSlot = page.locator('.repository-relation-shortcut[data-action="push"]');
    const pullSlot = page.locator('.repository-relation-shortcut[data-action="pull"]');
    await expect(pushSlot).toHaveCSS('opacity', '1');
    await expect(pullSlot).toHaveCSS('opacity', '0');
    await expect(push).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    const tools = page.getByRole('group', { name: '白板工具', exact: true });
    const pan = tools.getByRole('button', { name: '平移', exact: true });
    const extraTools = tools.locator('.canvas-hover-tools');
    await pan.click();
    const anchor = (await bridge.boundingBox())!;
    await page.mouse.move(anchor.x + anchor.width / 2, anchor.y - 40);
    await page.mouse.down();
    try {
      await expect(page.locator('.react-flow__pane')).toHaveClass(/\bdragging\b/);
      await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
      await expect(pullSlot).toHaveCSS('opacity', '0');
      await expect(pushSlot).toHaveCSS('opacity', '1');
      await expect(push).toHaveCSS('background-color', 'rgb(0, 169, 243)');
      const switchBox = (await pan.boundingBox())!;
      await page.mouse.move(switchBox.x + switchBox.width / 2, switchBox.y + switchBox.height / 2);
      await expect(extraTools).toHaveCSS('opacity', '0');
    } finally {
      await page.mouse.up();
    }
    await expect(extraTools).toHaveCSS('opacity', '1');
    await tools.getByRole('button', { name: '选择', exact: true }).click();
    await page.getByRole('button', { name: '适应白板', exact: true }).click();
    await bridge.focus();
    await expect(pullSlot).toHaveCSS('opacity', '1');
    await expect(pull).toBeDisabled();
    expect((await pull.boundingBox())!.x).toBeLessThan((await bridge.boundingBox())!.x);
    expect((await push.boundingBox())!.x).toBeGreaterThan((await bridge.boundingBox())!.x);
    await push.click();
    const dialog = page.getByRole('dialog', { name: '推送' });
    await expect(dialog).toContainText('开发 · main → 发布 · origin/main');
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(initial);
    const confirm = dialog.getByRole('button', { name: '推送', exact: true });
    await expect(push.locator('svg.lucide-upload')).toHaveCount(1);
    await expect(confirm.locator('svg.lucide-upload')).toBeVisible();
    await expect(confirm).toHaveCSS('background-color', 'rgb(0, 169, 243)');
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => git(remote, 'rev-parse', 'refs/heads/main')).toBe(head);
    await page.mouse.move(2, 2);
    await push.evaluate((button) => button.blur());
    await expect(pushSlot).toHaveCSS('opacity', '0');
    await expect(pullSlot).toHaveCSS('opacity', '0');
    await bridge.hover();
    for (const button of [pull, push]) {
      await expect(button).toBeDisabled();
      await button.hover();
      await expect(button).toHaveCSS('color', 'rgb(154, 164, 180)');
      await expect(button).toHaveCSS('background-color', 'rgb(36, 40, 46)');
      await button.click({ force: true });
      await button.press('Enter');
      await expect(dialog).toHaveCount(0);
    }
  } finally {
    await cleanup();
  }
});

test('待拉取默认亮绿色，明亮英文触屏可操作且确认按钮显示同款图标', async ({ browser, request, baseURL }) => {
  const { root, repo, cleanup } = await fixture();
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const initial = await commitFile(repo);
    const upstream = path.join(root, 'upstream');
    await git(root, 'clone', '--', repo, upstream);
    const head = await commitFile(upstream, 'incoming.txt', 'incoming');
    await git(repo, 'remote', 'add', 'origin', upstream);
    await git(repo, 'fetch', 'origin');
    await git(repo, 'branch', '--set-upstream-to=origin/main', 'main');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'repo', name: 'Project', path: repo }];
    Object.assign(workspace.boards[0], {
      nodes: [
        { id: 'a', repoId: 'repo', ref: 'refs/heads/main', position: { x: 0, y: 0 } },
        { id: 'b', repoId: 'repo', ref: 'refs/remotes/origin/main', position: { x: 620, y: 0 } },
      ],
      edges: [{ id: 'sync', source: 'a', target: 'b', kind: 'integration', label: '' }],
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('megit.preferences', JSON.stringify({
      version: 1, theme: 'light', language: 'en',
    })));
    await page.goto('/');
    await page.getByRole('button', { name: 'Fit board', exact: true }).tap();
    const pull = page.getByRole('button', { name: 'Pull: Project · origin/main → Project · main', exact: true });
    const push = page.getByRole('button', { name: 'Push: Project · main → Project · origin/main', exact: true });
    const pullSlot = page.locator('.repository-relation-shortcut[data-action="pull"]');
    const pushSlot = page.locator('.repository-relation-shortcut[data-action="push"]');
    await expect(pullSlot).toHaveCSS('opacity', '1');
    await expect(pull).toHaveCSS('background-color', 'rgb(170, 224, 98)');
    await expect(pull).toHaveCSS('color', 'rgb(0, 13, 31)');
    await expect(pull.locator('svg.lucide-download')).toBeVisible();
    await expect(pushSlot).toHaveCSS('opacity', '1');
    await expect(push).toBeDisabled();
    await pull.tap({ timeout: 5000 });
    const confirm = page.getByRole('dialog', { name: 'Pull' }).getByRole('button', { name: 'Pull', exact: true });
    await expect(confirm.locator('svg.lucide-download')).toBeVisible();
    await expect(confirm).toHaveCSS('background-color', 'rgb(170, 224, 98)');
    expect(await git(repo, 'rev-parse', 'HEAD')).toBe(initial);
    await confirm.tap();
    await expect(confirm).toBeHidden();
    expect(await git(repo, 'rev-parse', 'HEAD')).toBe(head);
    await expect(pull).toBeDisabled();
    await expect(pullSlot).toHaveCSS('opacity', '1');
  } finally {
    await context.close();
    await cleanup();
  }
});

test('本地整合在关系中启用后可用，刷新仍保留且不添加远端', async ({ page, request }) => {
  const { root, repo, cleanup } = await fixture();
  try {
    const initial = await commitFile(repo);
    const target = path.join(root, 'target');
    await git(root, 'clone', '--', repo, target);
    await git(target, 'remote', 'remove', 'origin');
    const head = await commitFile(repo, 'incoming.txt', 'incoming');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'a', name: 'A', path: repo }, { id: 'b', name: 'B', path: target }];
    Object.assign(workspace.boards[0], {
      nodes: [
        { id: 'a', repoId: 'a', position: { x: 0, y: 0 } },
        { id: 'b', repoId: 'b', position: { x: 620, y: 0 } },
      ],
      edges: [{ id: 'local', source: 'a', target: 'b', kind: 'integration', label: '' }],
    });
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('megit.preferences', JSON.stringify({
      version: 1, theme: 'light', language: 'en',
    })));
    await page.goto('/');
    const bridge = page.locator('.repository-relation-label');
    await bridge.hover();
    const integrate = page.getByRole('button', { name: 'Integrate into target: A · main → B · main', exact: true });
    await expect(integrate).toHaveCount(0);
    await bridge.click();
    await page.getByRole('button', { name: 'Edit relation', exact: true }).first().click();
    await page.getByRole('checkbox', { name: 'Enable fast-forward integration on this connection' }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Save relation', exact: true }).click();
    await expect(integrate).toBeAttached();
    await page.reload();
    await page.getByRole('button', { name: 'Close relation details' }).click();
    await bridge.hover();
    await expect(page.locator('.repository-relation-shortcut[data-action="integrate"]')).toHaveCSS('opacity', '1');
    await integrate.click();
    const dialog = page.getByRole('dialog', { name: 'Integrate into target' });
    await expect(dialog).toContainText('A · main → B · main');
    expect(await git(target, 'rev-parse', 'HEAD')).toBe(initial);
    await dialog.getByRole('button', { name: 'Integrate into target', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(bridge).toHaveText('Integrated');
    expect(await git(target, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(target, 'remote')).toBe('');
  } finally {
    await cleanup();
  }
});
