import { test, expect } from './test';
import { commitFile, fixture, git } from '../tests/fixtures';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function cssToken(element: Element, name: string) {
  const sample = document.createElement('span');
  sample.style.color = `var(${name})`;
  (element.closest('.cm-editor') ?? element).append(sample);
  const color = getComputedStyle(sample).color;
  sample.remove();
  return color;
}

test('从仓库详情编辑文本，再配置和使用 npm 版本快捷字段', async ({ page, request }) => {
  const { repo, cleanup } = await fixture();
  try {
    await commitFile(repo, 'README.md', 'First line\n');
    await mkdir(path.join(repo, 'docs'));
    await commitFile(repo, 'docs/guide.md', 'Guide\n');
    const manifest = '{"name":"demo","version":"1.0.0"}\n';
    const lock =
      '{"name":"demo","version":"1.0.0","lockfileVersion":3,"packages":{"":{"version":"1.0.0"}}}\n';
    await commitFile(repo, 'package.json', manifest);
    const head = await commitFile(repo, 'package-lock.json', lock);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'demo', name: 'Demo', path: repo }];
    workspace.boards[0].nodes = [{ id: 'demo', repoId: 'demo', position: { x: 20, y: 30 } }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    const card = page.getByTestId('repository-node');
    await card.getByRole('button', { name: /Demo/ }).first().click();
    const entry = page.getByRole('button', { name: '仓库文件', exact: true });
    await entry.click();
    const dialog = page.getByRole('dialog', { name: '仓库文件', exact: true });
    const fileHeader = dialog.locator(':scope > .dialog-header');
    const fileFooter = dialog.locator(':scope > .dialog-footer');
    await expect(fileHeader).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    await expect(fileFooter).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    const filesHeaderBox = (await fileHeader.boundingBox())!;
    const filesFooterBox = (await fileFooter.boundingBox())!;
    const filesTitleBox = (await fileHeader.getByRole('heading').boundingBox())!;
    expect(filesTitleBox.x + filesTitleBox.width / 2).toBeCloseTo(
      filesHeaderBox.x + filesHeaderBox.width / 2,
      0,
    );
    expect(filesFooterBox.width).toBe(filesHeaderBox.width);
    expect(filesFooterBox.height).toBe(filesHeaderBox.height);
    await expect(fileFooter.getByRole('button', { name: '预览差异' })).toHaveCSS(
      'background-color',
      'rgb(217, 225, 235)',
    );
    const tree = dialog.getByRole('navigation', { name: '文件树' });
    await tree.getByText('docs', { exact: true }).click();
    await tree.getByRole('button', { name: 'guide.md' }).click();
    const editor = dialog.getByRole('textbox', { name: '文件内容' });
    await expect(editor).toHaveClass(/cm-content/);
    await expect(editor).toHaveText('Guide');
    await expect(dialog.locator('.cm-lineNumbers')).toBeVisible();
    expect((await tree.boundingBox())!.x).toBeLessThan((await editor.boundingBox())!.x);
    await editor.press('Control+f');
    const find = dialog.getByRole('textbox', { name: '查找', exact: true });
    await expect(find).toBeFocused();
    await find.pressSequentially('Guide');
    const match = editor.locator('.cm-searchMatch').first();
    await expect(match).toHaveCSS(
      'background-color',
      await editor.evaluate(cssToken, '--diff-hunk-bg'),
    );
    await find.press('Escape');
    await expect(find).toHaveCount(0);
    await tree.getByRole('button', { name: 'README.md' }).click();
    await dialog.getByRole('textbox', { name: '文件内容' }).fill('New line\n');
    await expect(fileFooter.getByRole('button', { name: '预览差异' })).toHaveCSS(
      'background-color',
      'rgb(0, 169, 243)',
    );
    await editor.press('Control+z');
    await expect(editor).toHaveText('First line');
    await editor.fill('New line\n');
    await tree.getByRole('button', { name: 'guide.md' }).click();
    await page
      .getByRole('dialog', { name: '放弃编辑' })
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await expect(dialog.getByRole('textbox', { name: '文件内容' })).toHaveText('New line');
    await dialog.getByRole('button', { name: '预览差异' }).click();
    await expect(dialog.getByRole('region', { name: 'README.md 的差异' })).toContainText(
      '+New line',
    );
    expect(await readFile(path.join(repo, 'README.md'), 'utf8')).toBe('First line\n');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '文件内容' })).toHaveText('New line');
    expect(await readFile(path.join(repo, 'README.md'), 'utf8')).toBe('New line\n');

    await dialog.getByRole('button', { name: '设置快捷字段' }).click();
    const config = page.getByRole('dialog', { name: '设置快捷字段' });
    await config.getByRole('button', { name: '保存', exact: true }).click();
    await expect(config).not.toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(card.getByRole('button', { name: /编辑 版本/ })).toHaveCount(0);
    const worktree = page.getByRole('dialog', { name: '工作区', exact: true });
    await card.getByRole('button', { name: '已修改 1', exact: true }).click();
    await expect(worktree.locator('.repository-shortcut-button svg')).toHaveCount(0);
    const header = worktree.locator('.dialog-header');
    const footer = worktree.locator('.commit-compact-row');
    expect((await header.boundingBox())!.height).toBe((await footer.boundingBox())!.height);
    await expect(header).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    await expect(footer).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    const headerBox = (await header.boundingBox())!;
    const titleBox = (await header.getByRole('heading', { name: '工作区' }).boundingBox())!;
    expect(titleBox.x + titleBox.width / 2).toBeCloseTo(headerBox.x + headerBox.width / 2, 0);
    const identityBox = (await header.locator('.worktree-dialog-context').boundingBox())!;
    const actionsBox = (await header.locator('.dialog-header-actions').boundingBox())!;
    expect(identityBox.x - headerBox.x).toBeCloseTo(
      headerBox.x + headerBox.width - actionsBox.x - actionsBox.width,
      0,
    );
    const message = worktree.getByRole('textbox', { name: '提交说明', exact: true });
    const field = footer.locator('.commit-compact-field');
    await expect(field).toHaveCSS('background-color', 'rgb(245, 246, 248)');
    await message.focus();
    await expect(field).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(footer.locator('[data-action="commit"]')).toHaveCSS(
      'background-color',
      'rgb(217, 225, 235)',
    );
    await expect(worktree.locator('.repository-shortcut')).toHaveCSS(
      'background-color',
      await worktree.evaluate(cssToken, '--diff-hunk-bg'),
    );
    await worktree.getByRole('button', { name: '编辑 版本：1.0.0' }).click();
    const version = page.getByRole('dialog', { name: '版本', exact: true });
    expect(
      (await version.getByRole('textbox', { name: '字段值' }).boundingBox())!.x,
    ).toBeGreaterThan((await version.boundingBox())!.x + 12);
    await version.getByRole('textbox', { name: '字段值' }).fill('1.1.0');
    await version.getByRole('button', { name: '预览差异' }).click();
    await expect(version.getByRole('region', { name: 'package-lock.json 的差异' })).toContainText(
      '1.1.0',
    );
    await version.getByRole('button', { name: '保存', exact: true }).click();
    await expect(version).not.toBeVisible();
    await expect(worktree.getByRole('button', { name: '编辑 版本：1.1.0' })).toBeVisible();
    expect(await readFile(path.join(repo, 'package.json'), 'utf8')).toBe(
      manifest.replace('1.0.0', '1.1.0'),
    );
    expect(await readFile(path.join(repo, 'package-lock.json'), 'utf8')).toBe(
      lock.replaceAll('1.0.0', '1.1.0'),
    );
    expect(await git(repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(repo, 'diff', '--cached', '--name-only')).toBe('');
    await page.reload();
    await expect(worktree.getByRole('button', { name: '编辑 版本：1.1.0' })).toBeVisible();
  } finally {
    await cleanup();
  }
});

test('英文窄屏下 JSON 快捷字段遇到外部修改时保留输入并拒绝覆盖', async ({ page, request }) => {
  const { repo, cleanup } = await fixture();
  try {
    const filename = path.join(repo, 'project.json');
    await commitFile(repo, 'project.json', '{"name":"demo","release":{"channel":"beta"}}\n');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [
      {
        id: 'demo',
        name: 'Demo',
        path: repo,
        shortcut: {
          label: 'Channel',
          target: { kind: 'json', path: 'project.json', pointer: '/release/channel' },
        },
      },
    ];
    workspace.boards[0].nodes = [{ id: 'demo', repoId: 'demo', position: { x: 20, y: 30 } }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.setViewportSize({ width: 520, height: 780 });
    await page.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
      ),
    );
    await page.goto('/');
    await page
      .getByTestId('repository-node')
      .getByRole('button', { name: 'Staged 0', exact: true })
      .press('Enter');
    await page
      .getByRole('dialog', { name: 'Working tree', exact: true })
      .getByRole('button', { name: 'Edit Channel: beta' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Channel', exact: true });
    await dialog.getByRole('textbox', { name: 'Field value' }).fill('stable');
    await dialog.getByRole('button', { name: 'Preview changes' }).click();
    await expect(dialog.getByRole('region', { name: 'Changes to project.json' })).toContainText(
      'stable',
    );
    const external = '{"name":"external","release":{"channel":"nightly","build":42}}\n';
    await writeFile(filename, external);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('has changed');
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(await readFile(filename, 'utf8')).toBe(external);
    await dialog.getByRole('button', { name: 'Read again' }).click();
    const discard = page.getByRole('dialog', { name: 'Discard edits', exact: true });
    await discard.getByRole('button', { name: 'Discard edits', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Field value' })).toHaveValue('nightly');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const worktree = page.getByRole('dialog', { name: 'Working tree', exact: true });
    await worktree.getByRole('button', { name: 'Repository files', exact: true }).click();
    const files = page.getByRole('dialog', { name: 'Repository files', exact: true });
    await expect(files.locator(':scope > .dialog-header')).toHaveCSS(
      'background-color',
      'rgb(1, 53, 124)',
    );
    await expect(files.locator(':scope > .dialog-footer')).toHaveCSS('background-color', 'rgb(1, 53, 124)');
    expect(await files.evaluate((element) => element.scrollWidth)).toBe(
      await files.evaluate((element) => element.clientWidth),
    );
    const tree = files.getByRole('navigation', { name: 'File tree' });
    await tree.getByRole('button', { name: 'project.json', exact: true }).click();
    const editor = files.getByRole('textbox', { name: 'File contents' });
    await expect(editor).toHaveText(external.trim());
    await expect(editor.locator('span').first()).toBeVisible();
    const numericLiteral = editor.locator('span').filter({ hasText: /^42$/ });
    await expect(numericLiteral).toHaveCSS(
      'color',
      await editor.evaluate(cssToken, '--text-secondary'),
    );
    await editor.press('Control+f');
    await files.getByRole('textbox', { name: 'Find', exact: true }).pressSequentially('nightly');
    await expect(editor.locator('.cm-searchMatch').first()).toHaveCSS(
      'background-color',
      await editor.evaluate(cssToken, '--diff-hunk-bg'),
    );
    expect((await tree.boundingBox())!.y).toBeLessThan((await editor.boundingBox())!.y);
  } finally {
    await cleanup();
  }
});
