import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="currentColor"/></svg>';

async function seed(request: APIRequestContext, repo: string) {
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const workspace = await (await request.get('/api/workspace', { headers })).json();
  workspace.repositories = [{ id: 'avatar', name: '头像示例', path: repo }];
  workspace.boards = ['first', 'second'].map((id) => ({
    id,
    name: id,
    description: '',
    nodes: [{ id: `node-${id}`, repoId: 'avatar', position: { x: 100, y: 260 } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 0.8 },
  }));
  workspace.activeBoardId = 'first';
  expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
  return { headers, read: async () => (await request.get('/api/workspace', { headers })).json() };
}

test('从仓库目录选择头像，跨白板与刷新保留，各处共用且可恢复默认', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await mkdir(path.join(f.repo, 'assets'));
    await writeFile(path.join(f.repo, 'assets', '项目 logo.svg'), svg);
    const beforeGit = await git(f.repo, 'status', '--porcelain');
    const state = await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看头像示例', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '头像示例 仓库详情', exact: true });
    const configure = panel.getByRole('button', { name: '设置仓库头像', exact: true });
    await configure.click();
    const dialog = page.getByRole('dialog', { name: '仓库头像', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '打开目录 assets', exact: true }).click();
    await dialog.getByRole('button', { name: '选择图片 项目 logo.svg', exact: true }).click();
    await expect(dialog.locator('.repository-avatar-preview img')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '使用此头像', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.locator('.repository-avatar img')).toBeVisible();
    await expect(page.locator('.repository-node .repository-avatar img')).toBeVisible();
    await expect(page.locator('.outline-repo .repository-avatar img')).toBeVisible();
    await expect
      .poll(async () => (await state.read()).repositories[0].logoPath)
      .toBe('assets/项目 logo.svg');
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.megit/verification/repository-avatars/dark-zh.png' });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出工作流', exact: true }).click();
    await page.getByRole('button', { name: '导出 SVG', exact: true }).click();
    const saved = await download;
    const exported = await readFile((await saved.path())!, 'utf8');
    expect(exported).toContain('data:image/svg+xml;base64,');
    expect(exported).not.toContain(f.repo);
    const revision = (await state.read()).revision;
    await configure.click();
    await dialog.getByRole('button', { name: '恢复默认图标', exact: true }).click();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect((await state.read()).revision).toBe(revision);
    await expect(panel.locator('.repository-avatar img')).toBeVisible();
    await page.reload();
    await expect(page.locator('.repository-node .repository-avatar img')).toBeVisible();
    await page.getByRole('button', { name: 'second 1', exact: true }).click();
    await expect(page.locator('.repository-node .repository-avatar img')).toBeVisible();
    await page.getByRole('button', { name: '查看头像示例', exact: true }).click();
    await configure.click();
    await dialog.getByRole('button', { name: '恢复默认图标', exact: true }).click();
    await dialog.getByRole('button', { name: '使用此头像', exact: true }).click();
    await expect(page.locator('.repository-node .repository-avatar img')).toHaveCount(0);
    await expect.poll(async () => (await state.read()).repositories[0].logoPath || '').toBe('');
    expect(await git(f.repo, 'status', '--porcelain')).toBe(beforeGit);
  } finally {
    await f.cleanup();
  }
});

test('图片文件丢失后回退默认头像，错误可见且已有白板仍可编辑', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'logo.svg'), svg);
    const state = await seed(request, f.repo);
    const initial = await state.read();
    initial.repositories[0].logoPath = 'logo.svg';
    expect(
      (await request.put('/api/workspace', { headers: state.headers, data: initial })).ok(),
    ).toBe(true);
    await unlink(path.join(f.repo, 'logo.svg'));
    await page.goto('/');
    await expect(page.locator('.repository-node .repository-avatar')).toHaveAttribute(
      'data-logo-state',
      'error',
    );
    await expect(page.locator('.repository-node .repository-avatar img')).toHaveCount(0);
    await page.getByRole('button', { name: '查看头像示例', exact: true }).click();
    await page.getByRole('button', { name: '设置仓库头像', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '仓库头像', exact: true });
    await expect(dialog.getByRole('alert')).toContainText('找不到图片');
    await dialog.getByRole('button', { name: '恢复默认图标', exact: true }).click();
    await dialog.getByRole('button', { name: '使用此头像', exact: true }).click();
    await expect.poll(async () => (await state.read()).repositories[0].logoPath || '').toBe('');
    await expect(page.locator('.save-state')).toHaveText('已保存');
  } finally {
    await f.cleanup();
  }
});

test('键盘可设置头像，迟到的图片和目录结果不会覆盖当前选择', async ({ page, request }) => {
  const f = await fixture();
  let releaseImage = () => {};
  let releaseDirectory = () => {};
  try {
    await commitFile(f.repo);
    await mkdir(path.join(f.repo, 'assets'));
    await writeFile(path.join(f.repo, 'a.svg'), svg);
    const other = svg.replace('circle', 'ellipse').replace('r="14"', 'rx="14" ry="10"');
    await writeFile(path.join(f.repo, 'b.svg'), other);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '查看头像示例', exact: true }).click();
    const configure = page.getByRole('button', { name: '设置仓库头像', exact: true });
    await configure.focus();
    await expect(page.getByRole('tooltip')).toContainText('选择项目 Logo');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '仓库头像', exact: true });
    const imageReleased = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });
    const directoryReleased = new Promise<void>((resolve) => {
      releaseDirectory = resolve;
    });
    let imageHeld = false;
    let directoryHeld = false;
    await page.route('**/api/repositories/avatar/image?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('path') === 'a.svg' && !imageHeld) {
        imageHeld = true;
        await imageReleased;
      }
      await route.continue();
    });
    await page.route('**/api/repositories/avatar/images?*', async (route) => {
      if (
        new URL(route.request().url()).searchParams.get('directory') === 'assets' &&
        !directoryHeld
      ) {
        directoryHeld = true;
        await directoryReleased;
      }
      await route.continue();
    });
    await dialog.getByRole('button', { name: '选择图片 a.svg', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => imageHeld).toBe(true);
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '选择图片 b.svg', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.repository-avatar-preview img')).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(other).toString('base64')}`,
    );
    releaseImage();
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '打开目录 assets', exact: true }).click();
    await expect.poll(() => directoryHeld).toBe(true);
    await dialog.getByRole('button', { name: '仓库根目录', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '选择图片 b.svg', exact: true })).toBeVisible();
    releaseDirectory();
    await expect(dialog.getByRole('button', { name: '选择图片 b.svg', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '使用此头像', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(configure).toBeFocused();
  } finally {
    releaseImage();
    releaseDirectory();
    await f.cleanup();
  }
});

test('图片错误始终可见，目录和预览切换不使用过期结果', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'valid.svg'), svg);
    await writeFile(path.join(f.repo, 'broken.svg'), '<svg>invalid');
    await writeFile(path.join(f.repo, 'fake.png'), '<html>not an image</html>');
    const state = await seed(request, f.repo);
    const revision = (await state.read()).revision;
    await page.goto('/');
    await page.getByRole('button', { name: '查看头像示例', exact: true }).click();
    await page.getByRole('button', { name: '设置仓库头像', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '仓库头像', exact: true });
    await dialog.getByRole('button', { name: '选择图片 fake.png', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('请选择有效的');
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '选择图片 broken.svg', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('无法显示');
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '选择图片 valid.svg', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '使用此头像', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '设置仓库头像', exact: true })).toBeFocused();
    expect((await state.read()).revision).toBe(revision);
  } finally {
    await f.cleanup();
  }
});

test('明亮英文与390px触控可选择头像且无页面溢出', async ({ browser, request }) => {
  const f = await fixture();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'logo.svg'), svg);
    await seed(request, f.repo);
    await page.goto('/');
    await page.getByRole('button', { name: '偏好设置', exact: true }).tap();
    await page.getByRole('button', { name: '明亮', exact: true }).tap();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).tap();
    await page.getByRole('button', { name: 'View 头像示例', exact: true }).tap();
    await page.getByRole('button', { name: 'Set repository avatar', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Repository avatar', exact: true });
    await dialog.getByRole('button', { name: 'Select image logo.svg', exact: true }).tap();
    await expect(
      dialog.getByRole('button', { name: 'Use this avatar', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: '.megit/verification/repository-avatars/light-en-touch.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole('button', { name: 'Use this avatar', exact: true }).tap();
    await expect(page.locator('.repository-node .repository-avatar img')).toBeVisible();
  } finally {
    await context.close();
    await f.cleanup();
  }
});
