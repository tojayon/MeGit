import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

test.describe('明亮英文触控', () => {
  test.use({ viewport: { width: 390, height: 420 }, hasTouch: true });
  test('分支图例可点击阅读，三倍树干与方形位置在窄屏仍可辨认', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    const tree = page.getByRole('region', { name: 'Branch growth tree', exact: true });
    await expect(tree.locator('.tree-head-marker')).toHaveCount(1);
    await expect(tree.locator('button[aria-current="location"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'About Branch growth tree', exact: true }).click();
    const help = page.getByRole('tooltip');
    await expect(help).toContainText('solid square');
    await expect(help).toContainText('three times');
    await expect(help).toContainText('Rounded rectangles');
    await expect(help).toContainText('+X');
    expect(
      await help.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: '.megit/verification/branch-tree-symbols/light-en-touch.png',
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
  });
});

test('当前位置是实心方形，树干始终为树枝三倍粗，分支标签有局部说明', async ({ page }) => {
  await page.goto('/design-system');
  const tree = page.getByRole('region', { name: '分支生长树', exact: true });
  const head = tree.locator('rect.tree-head-marker');
  await expect(head).toHaveCount(1);
  expect(
    await head.evaluate((element) => {
      const box = (element as SVGGraphicsElement).getBBox();
      const style = getComputedStyle(element);
      return box.width === box.height && box.width > 0 && style.fill !== 'none';
    }),
  ).toBe(true);
  const widths = await tree.evaluate((element) => {
    const width = (selector: string) =>
      parseFloat(getComputedStyle(element.querySelector(selector)!).strokeWidth);
    return { trunk: width('.tree-edge.trunk'), branch: width('.tree-edge:not(.trunk)') };
  });
  expect(widths.trunk / widths.branch).toBeCloseTo(3);
  const label = tree.getByRole('button', { name: '查看分支 main', exact: true });
  await label.focus();
  await expect(page.getByRole('tooltip')).toContainText('refs/heads/main');
  await expect(page.getByRole('tooltip')).toContainText('merge');
  await expect(page.getByRole('tooltip')).not.toContainText('分支名称标签');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(label).toBeFocused();
  await page.getByRole('button', { name: '分支生长树说明', exact: true }).click();
  await expect(page.getByRole('tooltip')).toContainText('实心正方形');
  await expect(page.getByRole('tooltip')).toContainText('+X');
});

test('折叠数量打开可逐个点选的局部树，明亮英文主题保持一致', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'switch', '-c', 'feature/example');
    await commitFile(f.repo, 'feature.txt');
    await git(f.repo, 'switch', 'main');
    for (let i = 0; i < 38; i++) await commitFile(f.repo, 'main.txt', `fixture ${i}\n`);
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const inspected = await (
      await request.post('/api/repositories/inspect', { headers, data: { path: f.repo } })
    ).json();
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'symbols', name: '图形含义演示', path: inspected.path }];
    workspace.boards[0].nodes = [{ id: 'node', repoId: 'symbols', position: { x: 80, y: 100 } }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    await page.goto('/');
    await page.getByRole('button', { name: '查看图形含义演示', exact: true }).click();
    const folded = page.getByRole('button', { name: '已收起 37 个连续提交', exact: true });
    const tree = page.getByRole('region', { name: '分支生长树', exact: true });
    const mapState = () =>
      tree.evaluate((element) => ({
        left: element.scrollLeft,
        top: element.scrollTop,
        scale: (element.querySelector('.branch-tree-drawing') as HTMLElement).style.transform,
        nodes: element.querySelectorAll('.branch-tree-drawing > .branch-tree-lines .tree-node')
          .length,
      }));
    await folded.focus();
    await expect(page.getByRole('tooltip')).toContainText('这段连线中有 37 个连续提交');
    await expect(page.getByRole('tooltip')).not.toContainText('未推送');
    await page.keyboard.press('Escape');
    await expect(folded).toBeFocused();
    const before = await mapState();
    await folded.click();
    const lens = page.getByRole('dialog', { name: '局部提交历史', exact: true });
    await expect(lens).toBeVisible();
    await expect(lens.locator('[data-lens-commit]')).toHaveCount(37);
    const hidden = await git(f.repo, 'rev-parse', 'HEAD~20');
    await lens.locator(`[data-lens-commit="${hidden}"] button[data-commit]`).click();
    const actions = page.getByRole('dialog', { name: '提交操作', exact: true });
    await expect(actions.locator('.commit-point-summary')).toContainText(hidden.slice(0, 7));
    const author = await git(f.repo, 'show', '-s', '--format=%an', hidden);
    await expect(actions.locator('.commit-point-summary')).toContainText(author);
    expect(await mapState()).toEqual(before);
    await expect(lens).toBeVisible();
    await actions.getByRole('button', { name: '查看差异', exact: true }).focus();
    await expect(page.getByRole('tooltip')).toContainText('show --diff-merges=first-parent');
    await expect(page.getByRole('tooltip')).toContainText(hidden);
    await page.keyboard.press('Escape');
    await expect(lens).toBeVisible();
    await actions.getByRole('button', { name: '查看差异', exact: true }).click();
    const diff = page.getByRole('dialog', { name: '差异', exact: true });
    await expect(diff).toContainText(hidden.slice(0, 7));
    await page.keyboard.press('Escape');
    await expect(lens).toHaveCount(0);
    await tree.getByRole('button', { name: '查看分支 feature/example', exact: true }).click();
    await page.getByRole('button', { name: '图上比较', exact: true }).click();
    await expect(tree.locator('.tree-edge.source-only')).not.toHaveCount(0);
    const comparisonWidths = await tree.evaluate((element) => {
      const width = (selector: string) =>
        parseFloat(getComputedStyle(element.querySelector(selector)!).strokeWidth);
      return {
        trunk: width('.tree-edge.trunk.target-only'),
        branch: width('.tree-edge:not(.trunk).source-only'),
      };
    });
    expect(comparisonWidths.trunk / comparisonWidths.branch).toBeCloseTo(3);
    await folded.click();
    await expect(lens).toBeVisible();
    await page.screenshot({
      path: '.megit/verification/collapsed-lens/dark-zh.png',
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(folded).toBeFocused();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.getByRole('button', { name: 'Close Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Close branch details', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 420 });
    const english = page.getByRole('button', {
      name: '37 consecutive commits collapsed',
      exact: true,
    });
    await english.click();
    const englishLens = page.getByRole('dialog', { name: 'Local commit history', exact: true });
    await expect(englishLens).toBeVisible();
    await expect(englishLens.locator('[data-lens-commit]')).toHaveCount(37);
    expect(
      await englishLens.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 8 &&
          rect.top >= 8 &&
          rect.right <= innerWidth - 8 &&
          rect.bottom <= innerHeight - 8
        );
      }),
    ).toBe(true);
    const points = englishLens.locator('[data-lens-commit] button[data-commit]');
    await points.last().click();
    await expect(englishLens).toBeVisible();
    const first = await git(f.repo, 'rev-parse', 'HEAD~37');
    const englishActions = page.getByRole('dialog', { name: 'Commit actions', exact: true });
    await expect(englishActions).toContainText(first.slice(0, 7));
    await page.keyboard.press('Escape');
    expect(
      await points.last().evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: '.megit/verification/collapsed-lens/light-en-narrow.png',
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(english).toBeFocused();
    await page.getByRole('button', { name: 'Branch tree tools', exact: true }).click();
    await page.getByRole('button', { name: 'Expand consecutive commits', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(english).toHaveCount(0);
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
  } finally {
    await f.cleanup();
  }
});
