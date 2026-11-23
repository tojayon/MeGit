import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Locator } from '@playwright/test';
import { expect, test } from './test';
import { commitFile, fixture } from '../tests/fixtures';

async function expectStatusAtRight(statusbar: Locator, statusButton: Locator) {
  const bar = (await statusbar.boundingBox())!;
  const button = (await statusButton.boundingBox())!;
  const inset = await statusbar.evaluate((element) =>
    parseFloat(getComputedStyle(element).paddingRight),
  );
  expect(bar.x + bar.width - button.x - button.width).toBeCloseTo(inset, 0);
}

test('活动服务各用一个白板底栏标签直接打开终端，右侧详情占满高度', async ({
  page,
  request,
}, testInfo) => {
  test.skip(process.platform !== 'win32');
  await page.setViewportSize({ width: 1440, height: 900 });
  const projects = [
    { id: 'service-repo', name: '演示项目', example: await fixture() },
    { id: 'preview-repo', name: 'MeGit Preview', example: await fixture() },
  ].map((project) => ({
    ...project,
    url: `/api/repositories/${project.id}/local-service`,
    revision: undefined as string | undefined,
  }));
  const [first, second] = projects;
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'X-MeGit-Token': token };
  const summaryUrl = '/api/local-services';
  try {
    for (const { example } of projects) {
      await commitFile(example.repo);
      await writeFile(
        path.join(example.repo, 'package.json'),
        '{"scripts":{"dev":"node service.cjs"}}',
      );
      await writeFile(path.join(example.repo, 'service.cjs'), 'setInterval(() => {}, 1000);');
    }
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = projects.map(({ id, name, example }) => ({
      id,
      name,
      path: example.repo,
    }));
    workspace.boards[0].nodes = [
      { id: 'service-card', repoId: 'service-repo', position: { x: 150, y: 260 } },
    ];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    for (const project of projects) {
      const saved = await request.put(project.url, {
        headers,
        data: {
          kind: 'npm',
          entry: 'dev',
          directory: '.',
          port: null,
          trusted: true,
          revision: null,
        },
      });
      expect(saved.ok()).toBe(true);
      project.revision = (await saved.json()).config.revision;
    }
    expect((await request.get(summaryUrl)).status()).toBe(403);
    expect(await (await request.get(summaryUrl, { headers })).json()).toEqual([]);

    await page.goto('/');
    await page.getByRole('button', { name: '查看演示项目', exact: true }).click();
    const statusbar = page.locator('.workflow-panel .workspace-statusbar');
    const statusButton = statusbar.getByRole('button', { name: '状态信息', exact: true });
    const dock = page.getByRole('region', { name: '详情浏览区域', exact: true });
    const serviceButton = statusbar.getByRole('button', {
      name: `本地服务：${first.name}`,
      exact: true,
    });
    const secondButton = statusbar.getByRole('button', {
      name: `本地服务：${second.name}`,
      exact: true,
    });
    await expect(serviceButton).toHaveCount(0);
    await expectStatusAtRight(statusbar, statusButton);
    for (const { url, revision } of projects) {
      const start = await request.post(url, { headers, data: { action: 'start', revision } });
      expect(start.ok()).toBe(true);
    }
    await expect(serviceButton).toHaveText(first.name);
    await expect(secondButton).toHaveText(second.name);
    await expect(serviceButton.locator('svg')).toBeVisible();
    await expect(serviceButton).toHaveCSS('border-top-style', 'solid');
    await expect(serviceButton).toHaveCSS('border-top-width', '1px');
    await expectStatusAtRight(statusbar, statusButton);
    const firstTab = (await serviceButton.boundingBox())!;
    expect(firstTab.x + firstTab.width).toBeLessThan((await statusButton.boundingBox())!.x);
    const barBox = (await statusbar.boundingBox())!;
    const dockBox = (await dock.boundingBox())!;
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(dockBox.x + 1);
    expect(barBox.y + barBox.height).toBeCloseTo(dockBox.y + dockBox.height, 0);
    await expect
      .poll(async () => (await request.get(summaryUrl, { headers })).json())
      .toEqual(expect.arrayContaining(projects.map(({ id }) => ({ repoId: id, status: 'running' }))));
    await page.screenshot({ path: testInfo.outputPath('workspace-services-dark-zh.png') });
    const dialog = page.getByRole('dialog', { name: '本地服务', exact: true });
    await secondButton.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText(second.name, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(secondButton).toBeFocused();
    await serviceButton.click();
    await expect(dialog.getByText(first.name, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('运行中');
    await dialog.getByRole('button', { name: '停止', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('已停止');
    await expect(serviceButton).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(statusButton).toBeFocused();
    await expect(secondButton).toBeVisible();
    expect(await (await request.get(summaryUrl, { headers })).json()).toEqual([
      { repoId: second.id, status: 'running' },
    ]);
  } finally {
    for (const { url, revision, example } of projects) {
      if (revision) await request.post(url, { headers, data: { action: 'stop', revision } });
      await example.cleanup();
    }
  }
});

test('明亮英文窄屏中服务标签横向滚动，状态信息按钮保持右对齐', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
    );
  });
  await page.goto('/design-system');
  const statusbar = page.locator('.workspace-statusbar');
  const tabs = statusbar.getByRole('group', { name: 'Active local services', exact: true });
  const statusButton = statusbar.getByRole('button', { name: 'Status information', exact: true });
  const preview = tabs.getByRole('button', { name: 'Local service: MeGit', exact: true });
  const longName = tabs.getByRole('button', { name: /Local service: MeGit \/ repository/ });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS('border-top-width', '1px');
  await expect.poll(() => tabs.evaluate((row) => row.scrollWidth > row.clientWidth)).toBe(true);
  await statusbar.scrollIntoViewIfNeeded();
  await expect(statusButton).toBeInViewport();
  await expectStatusAtRight(statusbar, statusButton);
  await page.screenshot({ path: testInfo.outputPath('workspace-services-light-en.png') });
  await longName.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Local service', exact: true })).toContainText(
    'MeGit / repository-with-a-long-name-and-a-feature-branch',
  );
  await page.keyboard.press('Escape');
  await expect(longName).toBeFocused();
  await expect(statusButton).toBeInViewport();
  await expectStatusAtRight(statusbar, statusButton);
});
