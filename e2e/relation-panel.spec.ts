import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

test('关系详情使用响应式卡片、简短分支名及真实提交对比，已整合定位合入提交', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    const base = await commitFile(f.repo);
    const target = path.join(f.root, 'server');
    await git(f.root, 'clone', f.repo, target);
    await git(target, 'config', 'user.name', 'MeGit');
    await git(target, 'config', 'user.email', 'test@example.invalid');
    const sourceTip = await commitFile(f.repo, 'public.txt', 'public');
    const privateTip = await commitFile(target, 'private.txt', 'private');
    await git(f.repo, 'commit', '--amend', '-m', 'Public search');
    const amendedSource = await git(f.repo, 'rev-parse', 'HEAD');
    await git(target, 'commit', '--amend', '-m', 'Server authentication');
    await git(target, 'fetch', 'origin');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    expect(
      (
        await request.put('/api/workspace', {
          headers,
          data: {
            ...workspace,
            activeBoardId: 'relation-details',
            repositories: [
              { id: 's', name: 'MeWiki', path: f.repo },
              { id: 't', name: 'MeWiki-Server', path: target },
            ],
            boards: [
              {
                id: 'relation-details',
                name: '提交对比',
                description: '',
                nodes: [
                  { id: 's', repoId: 's', displayName: '公开发布线', position: { x: 0, y: 0 } },
                  { id: 't', repoId: 't', position: { x: 600, y: 0 } },
                ],
                edges: [
                  {
                    id: 'integration',
                    source: 's',
                    target: 't',
                    kind: 'integration',
                    label: '公共更新整合',
                    sourceRef: 'refs/heads/main',
                    targetRef: 'refs/heads/main',
                  },
                ],
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.goto('/');
    await page.locator('[data-edge-id="integration"]').click();
    const panel = page.getByRole('complementary', { name: '流程关系详情', exact: true });
    await expect(panel.locator('.relation-repository-card h3')).toHaveText([
      '公开发布线',
      'MeWiki-Server',
    ]);
    await expect(panel.locator('.relation-ref')).toHaveText(['main', 'main']);
    await expect(panel.locator('.relation-repository-tip')).toHaveCount(0);
    await expect(
      panel.locator('.comparison-lanes, .comparison-common, .comparison-selected'),
    ).toHaveCount(0);
    await expect(panel.locator(`[data-commit-hash="${base}"]`)).toBeVisible();
    await expect(panel.locator('.integration-history-wires path')).toHaveCount(2);
    const map = panel.locator('.integration-history-map');
    await expect(panel.locator('.integration-comparison + .integration-result')).toBeVisible();
    const sourceLane = map.getByRole('group', { name: '来源', exact: true });
    const targetLane = map.getByRole('group', { name: '目标', exact: true });
    await expect(sourceLane.locator(`[data-commit-hash="${amendedSource}"]`)).toBeVisible();
    await expect(targetLane.locator('.integration-map-commit')).toHaveCount(1);
    await expect(sourceLane).toHaveCSS('border-top-style', 'dashed');
    await expect(targetLane).toHaveCSS('border-top-style', 'dashed');
    const wires = map.locator('.integration-history-wires path');
    await expect(wires.first()).toHaveCSS('stroke-linecap', 'round');
    const paths = await wires.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('d') ?? ''),
    );
    expect(paths.filter((path) => !path.includes('C'))).toHaveLength(1);
    expect(paths.filter((path) => path.match(/\bC\b/g)?.length === 2)).toHaveLength(1);
    expect(paths.every((path) => path.includes('V'))).toBe(true);
    await panel.locator(`[data-commit-hash="${amendedSource}"] button`).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '提交详情' })).toContainText('Public search');
    await expect(page.getByRole('dialog', { name: '提交详情' })).toContainText(amendedSource);
    await panel.locator(`[data-commit-hash="${base}"] button`).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '提交详情' })).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: '提交详情' })).toContainText(base);
    await page.keyboard.press('Escape');
    const cards = panel.locator('.relation-repository-card');
    const first = (await cards.nth(0).boundingBox())!,
      second = (await cards.nth(1).boundingBox())!;
    expect(second.y).toBeGreaterThan(first.y + first.height);
    await panel.locator('.relation-ref').first().focus();
    await expect(page.getByRole('tooltip')).toContainText('refs/heads/main');
    await page.keyboard.press('Escape');
    await mkdir('.megit/verification/relation-panel', { recursive: true });
    await panel.screenshot({ path: '.megit/verification/relation-panel/pending-dark.png' });
    const resizer = page.getByRole('separator');
    await resizer.focus();
    await page.keyboard.press('End');
    await expect
      .poll(async () =>
        Math.abs((await cards.nth(1).boundingBox())!.y - (await cards.nth(0).boundingBox())!.y),
      )
      .toBeLessThan(2);
    await panel.screenshot({ path: '.megit/verification/relation-panel/pending-wide.png' });
    const sourceCard = (await cards.nth(0).boundingBox())!;
    const sourcePoint = (await panel
      .locator(`[data-commit-hash="${amendedSource}"]`)
      .boundingBox())!;
    expect(
      Math.abs(sourcePoint.x + sourcePoint.width / 2 - sourceCard.x - sourceCard.width / 2),
    ).toBeLessThan(2);
    expect(Math.abs(sourceCard.height - (await cards.nth(1).boundingBox())!.height)).toBeLessThan(
      2,
    );
    await git(target, 'merge', '--no-ff', 'origin/main', '-m', 'Integrate public search');
    const merge = await git(target, 'rev-parse', 'HEAD');
    await commitFile(target, 'later.txt', 'later');
    await page.reload();
    await expect(panel.locator('.integration-result.integrated')).toContainText(
      '目标已包含来源提交',
    );
    const callout = (await panel.locator('.integration-result').boundingBox())!;
    const help = (await panel.locator('.integration-result-help').boundingBox())!;
    expect(callout.x + callout.width - help.x - help.width).toBeLessThan(20);
    await panel.locator('.integration-result summary').click();
    await expect(panel.locator('.integration-result details')).toHaveAttribute('open', '');
    await expect(panel.locator('.integration-result dt')).toHaveText([
      '来源最新提交',
      '目标最新提交',
    ]);
    await expect(panel.locator('.integration-map-point.basis-highlight')).toHaveCount(2);
    await expect(panel.locator(`[data-commit-hash="${amendedSource}"]`)).toHaveClass(
      /basis-highlight/,
    );
    await expect(panel.locator('.basis-commit-role')).toHaveText(['来源最新提交', '目标最新提交']);
    await expect(panel.locator('.integration-result details')).toContainText(
      amendedSource.slice(0, 12),
    );
    await panel.screenshot({ path: '.megit/verification/relation-panel/basis-highlight.png' });
    await panel.locator('.integration-result summary').click();
    await expect(panel.locator('.integration-map-point.basis-highlight')).toHaveCount(0);
    await panel.locator(`[data-commit-hash="${merge}"] button`).click();
    await expect(page.getByRole('dialog', { name: '提交详情' })).toContainText(
      'Integrate public search',
    );
    await page.keyboard.press('Escape');
    await expect(panel.locator('.integration-history-wires path')).toHaveCount(2);
    await expect(panel.locator('.comparison-inclusion')).toHaveCount(0);
    const commonPoint = (await panel
      .locator(`[data-commit-hash="${amendedSource}"]`)
      .boundingBox())!;
    const commonCard = (await cards.nth(0).boundingBox())!;
    expect(
      Math.abs(commonPoint.x + commonPoint.width / 2 - commonCard.x - commonCard.width / 2),
    ).toBeLessThan(2);
    await page.evaluate(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({ version: 1, theme: 'light', language: 'en', inspectorWidth: 365 }),
      ),
    );
    await page.reload();
    const english = page.getByRole('complementary', {
      name: 'Workflow relation details',
      exact: true,
    });
    await english.locator(`[data-commit-hash="${merge}"] button`).click();
    await expect(page.getByRole('dialog', { name: 'Commit details' })).toContainText(
      'First included on target',
    );
    await page.keyboard.press('Escape');
    await english.screenshot({ path: '.megit/verification/relation-panel/integrated-light.png' });
    const newSource = await commitFile(f.repo, 'next.txt', 'D');
    await git(f.repo, 'commit', '--amend', '-m', 'Next public update');
    const d = await git(f.repo, 'rev-parse', 'HEAD');
    await git(target, 'fetch', 'origin');
    await page.reload();
    await expect(english.locator(`[data-commit-hash="${d}"]`)).toBeVisible();
    await expect(english.locator('.integration-map-commit')).toHaveCount(4);
    await expect(english.locator('.integration-history-wires path')).toHaveCount(3);
    await expect(english.locator(`[data-commit-hash="${d}"]`)).toBeVisible();
    expect(newSource).not.toBe(d);
    await english.screenshot({
      path: '.megit/verification/relation-panel/shared-version-range.png',
    });
    const endpoint = `/api/boards/relation-details/relations/integration/history`;
    expect((await request.get(endpoint)).status()).toBe(403);
    expect((await request.get(`${endpoint}?offset=30`, { headers })).status()).toBe(400);
    expect(
      (
        await request.get(`${endpoint}?sourceHash=${sourceTip}&targetHash=${privateTip}`, {
          headers,
        })
      ).status(),
    ).toBe(409);
    const data = await (await request.get(endpoint, { headers })).json();
    expect(data.includedAt).toBeNull();
    expect(data.commonBases.map((commit: { hash: string }) => commit.hash)).toEqual([
      amendedSource,
    ]);
    expect(data.targetOnly.total).toBe(2);
    // The target can stop at the shared version while the source continues.
    await git(target, 'update-ref', 'refs/heads/main', amendedSource);
    await page.reload();
    const targetPoint = english.locator(`[data-commit-hash="${amendedSource}"]`);
    await expect(targetPoint).toBeVisible();
    const pointBox = (await targetPoint.boundingBox())!;
    const targetLabel = (await english
      .locator('.integration-history-map')
      .getByRole('group', { name: 'Target', exact: true })
      .getByText('Target', { exact: true })
      .boundingBox())!;
    expect(
      Math.abs(pointBox.x + pointBox.width / 2 - targetLabel.x - targetLabel.width / 2),
    ).toBeLessThan(2);
    await expect(english.locator('.integration-map-commit')).toHaveCount(2);
    await targetPoint.locator('button').click();
    await expect(page.getByRole('dialog', { name: 'Commit details' })).toContainText(
      'Latest target commit',
    );
    await page.keyboard.press('Escape');
    await english.screenshot({
      path: '.megit/verification/relation-panel/target-at-shared-version.png',
    });
    expect(
      (
        await request.get('/api/boards/missing/relations/integration/history', { headers })
      ).status(),
    ).toBe(404);
  } finally {
    await f.cleanup();
  }
});

test('关系详情真实示例支持明亮英文窄屏和帮助提示', async ({ page }) => {
  await page.goto('/design-system');
  await page.evaluate(() =>
    localStorage.setItem(
      'megit.preferences',
      JSON.stringify({ version: 1, theme: 'light', language: 'en' }),
    ),
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page
    .locator('.design-card')
    .filter({ has: page.getByRole('heading', { name: 'Relation details panel', exact: true }) });
  await expect(card.locator('.integration-map-commit')).toHaveCount(4);
  const map = card.locator('.integration-history-map');
  const lanes = map.getByRole('group');
  await expect(lanes).toHaveCount(2);
  for (const lane of await lanes.all()) {
    await expect(lane).toHaveCSS('border-top-style', 'dashed');
    const frame = (await lane.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(390);
    for (const commit of await lane.locator('.integration-map-commit').all()) {
      const bounds = (await commit.boundingBox())!;
      expect(bounds.x).toBeGreaterThan(frame.x);
      expect(bounds.x + bounds.width).toBeLessThan(frame.x + frame.width);
      expect(bounds.y).toBeGreaterThan(frame.y);
      expect(bounds.y + bounds.height).toBeLessThan(frame.y + frame.height);
    }
  }
  await card.getByRole('button', { name: 'About the commit comparison' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('not necessarily');
  await page.keyboard.press('Escape');
  await card.getByLabel('Relation', { exact: true }).selectOption('true');
  await card.locator('[data-commit-hash^="4444444"] button').click();
  const popup = page.getByRole('dialog', { name: 'Commit details' });
  await expect(popup).toContainText('Merge public search');
  const popupBox = (await popup.boundingBox())!;
  expect(popupBox.x).toBeGreaterThanOrEqual(8);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(382);
  await mkdir('.megit/verification/relation-panel', { recursive: true });
  await page.screenshot({ path: '.megit/verification/relation-panel/commit-popover-light.png' });
  await page.keyboard.press('Escape');
  await mkdir('.megit/verification/relation-panel', { recursive: true });
  await card.screenshot({ path: '.megit/verification/relation-panel/narrow-light.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
