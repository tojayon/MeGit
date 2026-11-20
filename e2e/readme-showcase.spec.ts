import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, git } from '../tests/fixtures';

test('capture the English product gallery from isolated demo repositories', async ({
  page,
  request,
}) => {
  test.skip(!process.env.MEGIT_CAPTURE_README, 'Opt-in documentation capture');
  const demo = await fixture();
  try {
    const commit = async (name: string) => {
      await writeFile(path.join(demo.repo, `${name}.txt`), `${name}\n`);
      await git(demo.repo, 'add', '.');
      await git(demo.repo, 'commit', '-m', name);
    };
    await commit('Initial workspace');
    await commit('Add shared components');
    const app = path.join(demo.root, 'web-app');
    await git(demo.root, 'clone', demo.repo, app);
    await git(demo.repo, 'switch', '-c', 'feature/search');
    await commit('Add search index');
    await commit('Rank search results');
    await git(demo.repo, 'switch', 'main');
    await commit('Update UI tokens');
    await git(demo.repo, 'merge', '--no-ff', 'feature/search', '-m', 'Merge search');
    await git(demo.repo, 'switch', '-c', 'feature/export');
    await commit('Add export controls');
    await git(demo.repo, 'switch', 'main');
    await git(app, 'fetch');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    const board = {
      id: 'release',
      name: 'Release workflow',
      description: 'From shared components to a web release',
      viewport: { x: 125, y: 135, zoom: 1 },
      nodes: [
        { id: 'library', repoId: 'library', position: { x: 0, y: 0 } },
        { id: 'app', repoId: 'app', position: { x: 540, y: 0 } },
      ],
      edges: [
        {
          id: 'integration',
          kind: 'integration',
          source: 'library',
          target: 'app',
          label: 'Integrate changes',
          sourceRef: 'HEAD',
          targetRef: 'HEAD',
        },
      ],
      notes: [
        {
          id: 'checks',
          kind: 'decision',
          title: 'Checks pass?',
          text: '',
          position: { x: 595, y: 260 },
        },
        {
          id: 'release-step',
          kind: 'end',
          title: 'Ready to ship',
          text: '',
          position: { x: 595, y: 450 },
        },
      ],
      connections: [
        {
          id: 'verify',
          source: 'app',
          sourcePort: 'bottom',
          target: 'checks',
          targetPort: 'top',
          label: 'Run release checks',
        },
        {
          id: 'ship',
          source: 'checks',
          sourcePort: 'bottom',
          target: 'release-step',
          targetPort: 'top',
          label: 'Pass',
        },
        {
          id: 'retry',
          source: 'checks',
          sourcePort: 'left',
          target: 'library',
          targetPort: 'bottom',
          label: 'Fix and retry',
        },
      ],
    };
    const saved = await request.put('/api/workspace', {
      headers,
      data: {
        ...workspace,
        activeBoardId: board.id,
        boards: [board],
        repositories: [
          { id: 'library', name: 'UI Library', path: demo.repo },
          { id: 'app', name: 'Web App', path: app },
        ],
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() =>
      localStorage.setItem(
        'megit.preferences',
        JSON.stringify({
          version: 1,
          language: 'en',
          theme: 'light',
          inspectorWidth: 640,
        }),
      ),
    );
    await page.goto('/');
    const integration = page.locator('.repository-relation-label[data-edge-id="integration"]');
    await expect(integration).toContainText(/pending/i);
    await page.evaluate(() => document.fonts.ready.then(() => null));
    const capture = (name: string) =>
      page.screenshot({ path: `.megit/readme-capture/${name}.png`, animations: 'disabled' });
    await capture('workflow');
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.mouse.move(600, 740);
    await capture('workflow-dark');
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await integration.click();
    await page.mouse.move(850, 760);
    await expect(
      page.getByRole('complementary').filter({ hasText: 'Integrate changes' }),
    ).toBeVisible();
    await expect(page.locator('.integration-comparison')).toBeVisible();
    await page.getByText('Comparison details', { exact: true }).click();
    const relation = page.getByRole('complementary').filter({ hasText: 'Integrate changes' });
    await relation.screenshot({
      path: '.megit/readme-capture/integration.png',
      animations: 'disabled',
    });
    await relation.getByRole('button', { name: 'Close relation details', exact: true }).click();
    await page.getByRole('button', { name: 'View UI Library', exact: true }).click();
    await expect(page.locator('.tree-head-marker')).toBeVisible();
    await page.mouse.move(800, 760);
    await expect(integration).toContainText(/pending/i);
    await page
      .getByRole('complementary')
      .filter({ has: page.locator('.tree-head-marker') })
      .screenshot({
        path: '.megit/readme-capture/branch-map.png',
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('button', { name: 'Learn Git', exact: true }).click();
    const lesson = page.getByRole('dialog', { name: 'Git visual classroom' });
    await lesson.getByRole('button', { name: /Merge branches/ }).click();
    await lesson.locator('.learning-progress button').nth(3).click();
    await page.mouse.move(2, 2);
    await capture('git-classroom');
    await page.route('**/api/ai/settings', (route) =>
      route.fulfill({ json: { endpoint: '', model: 'Demo model', hasApiKey: false } }),
    );
    await page.addInitScript(() => {
      const repositoryIds = ['library', 'app'];
      sessionStorage.setItem(
        'megit.view-state',
        JSON.stringify({
          version: 1,
          entries: [
            ['assistant.frame', { x: 820, y: 304, width: 550, height: 550 }],
            [
              'assistant.session',
              {
                activeId: 'demo-chat',
                conversations: [
                  {
                    id: 'demo-chat',
                    title: 'Release readiness',
                    draft: '',
                    repositoryIds,
                    includeStagedDiff: false,
                    messages: [
                      {
                        id: 'question',
                        role: 'user',
                        repositoryIds,
                        text: 'Is Web App ready to ship? Compare it with UI Library and suggest the next step.',
                      },
                      {
                        id: 'answer',
                        role: 'assistant',
                        repositoryIds,
                        text: 'Web App is missing four commits from UI Library. Open the Pending 4 connection to see exactly which commits are missing.\n\nNext: review those commits, integrate the intended changes, and rerun the release checks. No Git actions have been taken.',
                      },
                    ],
                  },
                ],
              },
            ],
          ],
        }),
      );
    });
    await page.reload();
    await expect(integration).toContainText(/pending/i);
    await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
    const assistant = page.getByRole('complementary', { name: 'MeGit AI assistant', exact: true });
    await expect(assistant.getByText(/No Git actions have been taken/)).toBeVisible();
    await expect(assistant.getByText('Demo model', { exact: true })).toBeVisible();
    await page.mouse.move(2, 120);
    await capture('ai-assistant');
  } finally {
    await demo.cleanup();
  }
});
