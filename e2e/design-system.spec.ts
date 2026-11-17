import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';

test('仓库路径错误关联字段并聚焦；提交中防重复和意外关闭', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加仓库', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const path = dialog.getByLabel('仓库路径', { exact: true });
  await path.fill('Z:\\megit-missing-design-fixture');
  let inspections = 0;
  let release!: () => void;
  const submitted = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/repositories/inspect', async (route) => {
    inspections++;
    await submitted;
    await route.continue();
  });
  const submit = dialog.getByRole('button', { name: '添加到白板', exact: true });
  await submit.click();
  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(submit).toBeDisabled();
  await expect(path).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(path).toHaveAttribute('aria-invalid', 'true');
  await expect(path).toBeFocused();
  await expect(path).toHaveAccessibleDescription(/目录不存在/);
  await expect(submit).toBeEnabled();
  expect(inspections).toBe(1);
  await path.fill('Z:\\corrected-design-fixture');
  await expect(path).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('保存传输失败保留修改并可重试；版本冲突保持停止写入', async ({ page, request }) => {
  await page.goto('/');
  let writes = 0;
  let failure: 'saveFailed' | 'workspaceConflict' | null = 'saveFailed';
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    if (failure) {
      await route.fulfill({
        status: failure === 'workspaceConflict' ? 409 : 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: failure }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '工作流选项', exact: true }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('设计规范验收');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  const retry = page.getByRole('button', { name: '重试保存', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('main', { name: '设计规范验收', exact: true })).toBeVisible();
  expect(writes).toBe(1);
  failure = null;
  await retry.click();
  await expect(page.locator('.save-state')).toHaveText('已保存');
  const { token } = await (await request.get('/api/session')).json();
  const current = await (
    await request.get('/api/workspace', { headers: { 'X-MeGit-Token': token } })
  ).json();
  expect(current.boards[0].name).toBe('设计规范验收');
  failure = 'workspaceConflict';
  await page.getByRole('button', { name: '工作流选项', exact: true }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('保留未保存修改');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('另一页面更新');
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole('button', { name: '刷新页面', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '工作流选项', exact: true }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('冲突后的编辑');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  expect(writes).toBe(3);
  await expect(page.getByRole('main', { name: '保留未保存修改', exact: true })).toBeVisible();
});

test('真实组件示例独立于工作区，双主题双语与触控窄屏可用', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: '设计规范', exact: true })).toBeVisible();
  const dock = page.getByRole('region', { name: '详情浏览区域', exact: true });
  await expect(dock.locator('.dock-card')).toHaveCount(2);
  const drafts = dock.getByLabel('提交说明', { exact: true });
  await drafts.nth(0).fill('示例第一份草稿');
  await drafts.nth(1).fill('示例第二份草稿');
  await drafts.nth(0).focus();
  await expect(drafts.nth(0)).toHaveValue('示例第一份草稿');
  await expect(drafts.nth(1)).toHaveValue('示例第二份草稿');
  await expect(page.getByRole('button', { name: '保存中', exact: true })).toBeDisabled();
  const field = page.getByLabel('示例名称', { exact: true });
  await page.getByRole('button', { name: '验证表单', exact: true }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toBeFocused();
  await expect(field).toHaveAccessibleDescription(/请填写/);
  await field.fill('可复用的界面');
  await page.getByRole('button', { name: '验证表单', exact: true }).click();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  const example = page.getByRole('button', { name: '查看详情', exact: true });
  await example.focus();
  await expect(page.getByRole('tooltip', { name: '查看详情', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('button', { name: '明亮', exact: true }).click();
  await page.getByLabel('界面语言').selectOption('en');
  await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Design guidelines', exact: true })).toBeVisible();
  await expect(field).toHaveCount(0);
  await expect(page.getByLabel('Example name', { exact: true })).toHaveValue('可复用的界面');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(apiRequests).toEqual([]);
});

test('展开检查器与导航保留手动视角，分组与关系错误聚焦对应控件', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const target = path.join(f.root, 'design-target');
    await git(f.root, 'clone', f.repo, target);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    const seeded = await request.put('/api/workspace', {
      headers,
      data: {
        ...workspace,
        repositories: [
          { id: 'design-source', name: '规范源仓库', path: f.repo },
          { id: 'design-target', name: '规范目标仓库', path: target },
        ],
        boards: [
          {
            ...workspace.boards[0],
            viewport: { x: 40, y: 50, zoom: 0.8 },
            nodes: [
              { id: 'design-a', repoId: 'design-source', position: { x: 100, y: 160 } },
              { id: 'design-b', repoId: 'design-target', position: { x: 600, y: 160 } },
            ],
          },
        ],
      },
    });
    expect(seeded.ok()).toBe(true);
    await page.goto('/');
    await expect(page.getByTestId('repository-node')).toHaveCount(2);
    await page.clock.install();
    const viewport = page.locator('.react-flow__viewport');
    const initial = await viewport.getAttribute('style');
    await page.getByRole('button', { name: '查看规范源仓库', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: '规范源仓库 仓库详情', exact: true }),
    ).toBeVisible();
    await page.clock.runFor(400);
    await expect(viewport).toHaveAttribute('style', initial!);
    await page.getByRole('button', { name: '关闭仓库详情', exact: true }).click();
    await page.getByRole('button', { name: '收起流程导航', exact: true }).click();
    await page.clock.runFor(400);
    await expect(viewport).toHaveAttribute('style', initial!);
    await page.getByRole('button', { name: '展开流程导航', exact: true }).click();
    await page.clock.runFor(400);
    await expect(viewport).toHaveAttribute('style', initial!);
    await page.getByRole('button', { name: '仓库分组', exact: true }).click();
    await page.getByLabel('分组名称', { exact: true }).fill('规范分组');
    await page.getByRole('button', { name: '保存分组', exact: true }).click();
    const firstMember = page.getByRole('checkbox').first();
    await expect(firstMember).toBeFocused();
    await expect(firstMember).toHaveAccessibleDescription('请至少选择一个仓库。');
    await firstMember.check();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '建立关系', exact: true }).click();
    const ref = page.getByLabel('来源引用', { exact: true });
    await ref.fill('invalid ref');
    await page.getByRole('button', { name: '保存关系', exact: true }).click();
    await expect(ref).toBeFocused();
    await expect(ref).toHaveAttribute('aria-invalid', 'true');
    await expect(ref).toHaveAccessibleDescription('请填写有效的分支名或提交 SHA。');
    await ref.fill('HEAD');
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

test('粗指针环境的标准与紧凑按钮均有 44px 命中目标', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { name: '设计规范', exact: true })).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const controls = page.locator('.design-system-page .button, .design-system-page .icon-button');
    const heights = await controls.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(5);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: '紧凑按钮', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
