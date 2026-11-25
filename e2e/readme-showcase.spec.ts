import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, git } from '../tests/fixtures';
import { openRepositoryTools, selectBranch } from './branch-tree-helpers';

test.use({ actionTimeout: 8000 });

const galleries = [
  {
    language: 'en',
    workflow: 'Release workflow',
    description: 'From shared components to a web release',
    library: 'UI Library',
    app: 'Web App',
    integration: 'Integrate changes',
    checks: 'Checks pass?',
    release: 'Ready to ship',
    verify: 'Run release checks',
    pass: 'Pass',
    retry: 'Fix and retry',
    pending: 'Pending 4',
    preferences: 'Preferences',
    dark: 'Dark',
    light: 'Light',
    comparison: 'Comparison details',
    closeRelation: 'Close relation details',
    repository: 'View UI Library',
    zoomOut: 'Zoom out of branch tree',
    help: 'Help',
    learn: 'Learn Git',
    classroom: 'Git visual classroom',
    lesson: /Merge branches/,
    assistant: 'AI assistant',
    assistantPanel: 'MeGit AI assistant',
    model: 'Demo model',
    conversation: 'Release readiness',
    question: 'Is Web App ready to ship? Compare it with UI Library and suggest the next step.',
    answer:
      'Web App is missing four commits from UI Library. Open the Pending 4 connection to see which commits are missing.\n\nReview and integrate the changes, then rerun the release checks.',
  },
  {
    language: 'zh-CN',
    workflow: '发布工作流',
    description: '从共享组件到 Web 应用发布',
    library: '组件库',
    app: 'Web 应用',
    integration: '整合组件库改动',
    checks: '发布检查通过？',
    release: '可以发布',
    verify: '运行发布检查',
    pass: '通过',
    retry: '修复后重试',
    pending: '待整合 4',
    preferences: '偏好设置',
    dark: '暗黑',
    light: '明亮',
    comparison: '比较依据',
    closeRelation: '关闭关系详情',
    repository: '查看组件库',
    zoomOut: '缩小分支树',
    help: '使用帮助',
    learn: '学习 Git',
    classroom: 'Git 图解课堂',
    lesson: /合并分支/,
    assistant: 'AI 助手',
    assistantPanel: 'MeGit AI 助手',
    model: '演示模型',
    conversation: '发布准备',
    question: 'Web 应用可以发布了吗？请和组件库比较，给出下一步建议。',
    answer:
      'Web 应用还缺少组件库的 4 个提交。点开「待整合 4」连线可以查看具体提交。\n\n建议审阅并整合所需改动，再重新运行发布检查。',
  },
];

for (const copy of galleries) {
  test(`capture the ${copy.language} product gallery from isolated demo repositories`, async ({
    page,
    request,
  }) => {
    test.skip(!process.env.MEGIT_CAPTURE_README, 'Opt-in documentation capture');
    test.setTimeout(90000);
    const english = copy.language === 'en';
    const label = (en: string, zh: string) => (english ? en : zh);
    const button = (en: string, zh: string) =>
      page.getByRole('button', { name: label(en, zh), exact: true });
    const dialog = (en: string, zh: string) =>
      page.getByRole('dialog', { name: label(en, zh), exact: true });
    const demo = await fixture();
    try {
      const commit = async (name: string) => {
        await writeFile(path.join(demo.repo, `${name}.txt`), `${name}\n`);
        await git(demo.repo, 'add', '.');
        await git(demo.repo, 'commit', '-m', name);
      };
      await writeFile(
        path.join(demo.repo, 'README.md'),
        '# Release Demo\n\n## Release checklist\n\n- Build the application\n- Run the test suite\n',
      );
      await writeFile(
        path.join(demo.repo, 'package.json'),
        '{\n  "name": "release-demo",\n  "version": "1.4.0",\n  "private": true\n}\n',
      );
      await writeFile(
        path.join(demo.repo, 'package-lock.json'),
        '{\n  "name": "release-demo",\n  "version": "1.4.0",\n  "lockfileVersion": 3,\n  "packages": { "": { "name": "release-demo", "version": "1.4.0" } }\n}\n',
      );
      await mkdir(path.join(demo.repo, 'docs'));
      await writeFile(path.join(demo.repo, 'docs', 'release.md'), '# Release process\n');
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
      await writeFile(
        path.join(demo.repo, 'export.ts'),
        "export function downloadName(project: string, format: 'svg' | 'png') {\n  const name = project.toLowerCase().replaceAll(' ', '-');\n  return name + '.' + format;\n}\n",
      );
      await commit('Add export controls');
      await git(demo.repo, 'switch', 'main');
      await git(app, 'fetch');
      await writeFile(
        path.join(app, 'release-checks.md'),
        '# Preview checks\n\n- Verify keyboard navigation\n- Smoke test the light and dark themes\n',
      );
      await git(app, 'add', 'release-checks.md');
      await writeFile(
        path.join(app, 'preview.config.json'),
        '{\n  "mode": "preview",\n  "port": 5173\n}\n',
      );
      const { token } = await (await request.get('/api/session')).json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      const board = {
        id: 'release',
        name: copy.workflow,
        description: copy.description,
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
            label: copy.integration,
            sourceRef: 'HEAD',
            targetRef: 'HEAD',
          },
        ],
        notes: [
          {
            id: 'checks',
            kind: 'decision',
            title: copy.checks,
            text: '',
            position: { x: 595, y: 260 },
          },
          {
            id: 'release-step',
            kind: 'end',
            title: copy.release,
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
            label: copy.verify,
          },
          {
            id: 'ship',
            source: 'checks',
            sourcePort: 'bottom',
            target: 'release-step',
            targetPort: 'top',
            label: copy.pass,
          },
          {
            id: 'retry',
            source: 'checks',
            sourcePort: 'left',
            target: 'library',
            targetPort: 'bottom',
            label: copy.retry,
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
            { id: 'library', name: copy.library, path: demo.repo },
            {
              id: 'app',
              name: copy.app,
              path: app,
              shortcut: { target: { kind: 'npm' } },
            },
          ],
        },
      });
      expect(saved.ok(), await saved.text()).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript(
        (language) =>
          localStorage.setItem(
            'megit.preferences',
            JSON.stringify({
              version: 1,
              language,
              theme: 'light',
              inspectorWidth: 720,
            }),
          ),
        copy.language,
      );
      await page.goto('/');
      const integration = page.locator('.repository-relation-label[data-edge-id="integration"]');
      await expect(page.locator('html')).toHaveAttribute('lang', copy.language);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(integration).toContainText(copy.pending);
      await page.evaluate(() => document.fonts.ready.then(() => null));
      const imagePath = (name: string) => `.megit/readme-capture/${copy.language}/${name}.png`;
      const capture = (name: string) =>
        page.screenshot({ path: imagePath(name), animations: 'disabled' });
      const changeTheme = async (theme: 'light' | 'dark') => {
        await button(copy.preferences, copy.preferences).click();
        await button(copy[theme], copy[theme]).click();
        await page.keyboard.press('Escape');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.mouse.move(450, 735);
      };
      await button(copy.preferences, copy.preferences).click();
      await dialog(copy.preferences, copy.preferences).screenshot({
        path: imagePath('preferences'),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(450, 735);
      await capture('workflow');
      await changeTheme('dark');
      await capture('workflow-dark');
      await changeTheme('light');
      const launcher = page.getByRole('button', { name: copy.assistant, exact: true });
      const launcherBox = await launcher.boundingBox();
      expect(launcherBox).not.toBeNull();
      const launcherY = launcherBox!.y + launcherBox!.height / 2;
      await page.mouse.move(launcherBox!.x + launcherBox!.width / 2, launcherY);
      await page.mouse.down();
      await page.mouse.move(80, launcherY, { steps: 5 });
      await page.mouse.up();
      await expect(launcher).toHaveAttribute('data-edge', 'left');
      await integration.click();
      await page.mouse.move(850, 760);
      await expect(page.locator('.relation-inspector')).toBeVisible();
      await expect(page.locator('.integration-comparison')).toBeVisible();
      await page.getByText(copy.comparison, { exact: true }).click();
      await page.mouse.move(450, 735);
      const relation = page.locator('.relation-inspector');
      await relation.screenshot({
        path: imagePath('integration'),
        animations: 'disabled',
      });
      await relation.getByRole('button', { name: copy.closeRelation, exact: true }).click();
      await page.getByRole('button', { name: copy.repository, exact: true }).click();
      await expect(page.locator('.tree-head-marker')).toBeVisible();
      await page.locator('.branch-tree-map-controls').hover();
      await page.getByRole('button', { name: copy.zoomOut, exact: true }).click();
      await page.mouse.move(450, 735);
      await expect(integration).toContainText(copy.pending);
      const branchPanel = page
        .getByRole('complementary')
        .filter({ has: page.locator('.tree-head-marker') });
      await branchPanel.screenshot({ path: imagePath('branch-map'), animations: 'disabled' });
      await changeTheme('dark');
      await branchPanel.screenshot({ path: imagePath('branch-map-dark'), animations: 'disabled' });
      await changeTheme('light');
      await button('Compare in tree: feature/export', '图上比较：feature/export').click();
      const comparison = page.locator('.branch-tree-comparison-popover');
      await expect(comparison).toContainText('main');
      await expect(comparison).toContainText(label('unique to this branch', '此分支独有'));
      await page.mouse.move(450, 735);
      await branchPanel.screenshot({
        path: imagePath('branch-comparison'),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await button(
        'View commit differences: feature/export',
        '查看提交差异：feature/export',
      ).click();
      const diff = dialog('Diff', '差异');
      await expect(diff.getByTestId('diff-view')).toContainText('export.ts');
      await expect(diff.getByTestId('diff-view')).toContainText('downloadName');
      await page.mouse.move(2, 2);
      await diff.screenshot({ path: imagePath('commit-diff'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await button('Close repository details', '关闭仓库详情').click();

      await button('View Web App', '查看Web 应用').click();
      const worktreePanel = page
        .getByRole('complementary')
        .filter({ has: page.locator('.tree-head-marker') });
      await selectBranch(worktreePanel, 'main', english);
      const worktree = await openRepositoryTools(page, 'worktree', worktreePanel, english);
      await expect(worktree).toContainText('release-checks.md');
      await expect(worktree).toContainText('preview.config.json');
      await worktree
        .getByRole('textbox', { name: label('Commit message', '提交说明'), exact: true })
        .fill(label('test: add release smoke checks', 'test: 添加发布冒烟检查'));
      await page.mouse.move(2, 2);
      await worktree.screenshot({ path: imagePath('working-tree'), animations: 'disabled' });
      await worktree
        .getByRole('button', {
          name: label('Edit Version: 1.4.0', '编辑 版本：1.4.0'),
          exact: true,
        })
        .click();
      const version = dialog('Version', '版本');
      await version.getByRole('textbox', { name: label('Field value', '字段值') }).fill('1.5.0');
      await button('Preview changes', '预览差异').click();
      await expect(
        version.getByRole('region', {
          name: label('Changes to package-lock.json', 'package-lock.json 的差异'),
        }),
      ).toContainText('1.5.0');
      await page.mouse.move(2, 2);
      await version.screenshot({ path: imagePath('version-preview'), animations: 'disabled' });
      await button('Cancel', '取消').click();
      await dialog('Discard edits', '放弃编辑')
        .getByRole('button', { name: label('Discard edits', '放弃编辑'), exact: true })
        .click();

      await page.keyboard.press('Escape');
      await changeTheme('dark');
      await openRepositoryTools(page, 'worktree', worktreePanel, english);
      await worktree.screenshot({ path: imagePath('working-tree-dark'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await changeTheme('light');

      const appCard = page.locator('[data-id="app"]').getByTestId('repository-node');
      await appCard
        .getByRole('button', {
          name: label('Expand commit message', '展开提交消息'),
          exact: true,
        })
        .click();
      const message = dialog('Commit message', '提交说明');
      await message
        .getByRole('textbox')
        .fill(
          label(
            'test: add release smoke checks\n\n- Verify keyboard navigation\n- Check the light and dark themes\n- Confirm the local preview starts',
            'test: 添加发布冒烟检查\n\n- 验证键盘导航\n- 检查明亮和暗黑主题\n- 确认本地预览可以启动',
          ),
        );
      await page.mouse.move(2, 2);
      await capture('commit-message');
      await page.keyboard.press('Escape');

      await button('Repository files', '仓库文件').click();
      const files = dialog('Repository files', '仓库文件');
      const fileTree = files.getByRole('navigation', {
        name: label('File tree', '文件树'),
        exact: true,
      });
      await fileTree.getByText('docs', { exact: true }).click();
      await fileTree.getByRole('button', { name: 'README.md', exact: true }).click();
      await expect(
        files.getByRole('textbox', { name: label('File contents', '文件内容') }),
      ).toContainText('Release checklist');
      await page.mouse.move(2, 2);
      await files.screenshot({ path: imagePath('repository-file-tree'), animations: 'disabled' });
      await files
        .getByRole('textbox', { name: label('File contents', '文件内容') })
        .fill(
          '# Release Demo\n\n## Release checklist\n\n- Build the application\n- Run the smoke tests\n- Verify keyboard navigation\n',
        );
      await button('Preview changes', '预览差异').click();
      await expect(
        files.getByRole('region', { name: label('Changes to README.md', 'README.md 的差异') }),
      ).toContainText('Verify keyboard navigation');
      await page.mouse.move(2, 2);
      await files.screenshot({ path: imagePath('repository-files'), animations: 'disabled' });
      await button('Cancel', '取消').click();
      await dialog('Discard edits', '放弃编辑')
        .getByRole('button', { name: label('Discard edits', '放弃编辑'), exact: true })
        .click();

      await page.route('**/api/repositories/app/local-service', (route) =>
        route.fulfill({
          json: {
            available: true,
            config: { kind: 'npm', directory: '.', entry: 'dev', port: 5173, revision: 'demo' },
            status: 'running',
            log: '> release-demo@1.4.0 dev\n> vite\n\n  VITE ready in 180 ms\n\n  ➜  Local: http://127.0.0.1:5173/\n  ✓  Application ready for preview\n',
          },
        }),
      );
      const openLocalService = () => button('Local service', '本地服务').click();
      const service = dialog('Local service', '本地服务');
      await openLocalService();
      await expect(service.locator('pre')).toContainText('Application ready for preview');
      await page.mouse.move(2, 2);
      await capture('local-service');
      await page.keyboard.press('Escape');
      await changeTheme('dark');
      await openLocalService();
      await expect(service.locator('pre')).toContainText('Application ready for preview');
      await page.mouse.move(2, 2);
      await capture('local-service-dark');
      await page.keyboard.press('Escape');
      await changeTheme('light');
      await button('Close repository details', '关闭仓库详情').click();

      await page.getByRole('button', { name: copy.help, exact: true }).click();
      await page.getByRole('button', { name: copy.learn, exact: true }).click();
      const lesson = page.getByRole('dialog', { name: copy.classroom });
      await lesson.getByRole('button', { name: copy.lesson }).click();
      await lesson.locator('.learning-progress button').nth(3).click();
      await page.mouse.move(2, 2);
      await lesson.screenshot({ path: imagePath('git-classroom'), animations: 'disabled' });
      await page.route('**/api/ai/settings', (route) =>
        route.fulfill({ json: { endpoint: '', model: copy.model, hasApiKey: false } }),
      );
      await page.addInitScript(
        ({ conversation, question, answer }) => {
          const repositoryIds = ['library', 'app'];
          sessionStorage.setItem(
            'megit.view-state',
            JSON.stringify({
              version: 1,
              entries: [
                ['assistant.frame', { x: 780, y: 310, width: 600, height: 525 }],
                [
                  'assistant.session',
                  {
                    activeId: 'demo-chat',
                    conversations: [
                      {
                        id: 'demo-chat',
                        title: conversation,
                        draft: '',
                        repositoryIds,
                        includeStagedDiff: false,
                        messages: [
                          {
                            id: 'question',
                            role: 'user',
                            repositoryIds,
                            text: question,
                          },
                          {
                            id: 'answer',
                            role: 'assistant',
                            repositoryIds,
                            text: answer,
                          },
                        ],
                      },
                    ],
                  },
                ],
              ],
            }),
          );
        },
        { conversation: copy.conversation, question: copy.question, answer: copy.answer },
      );
      await page.reload();
      await expect(integration).toContainText(copy.pending);
      await page.getByRole('button', { name: copy.assistant, exact: true }).click();
      const assistant = page.getByRole('complementary', { name: copy.assistantPanel, exact: true });
      await expect(assistant.getByText(copy.question, { exact: true })).toBeVisible();
      await expect(assistant.getByText(copy.model, { exact: true })).toBeVisible();
      await page.mouse.move(2, 120);
      await capture('ai-assistant');
      await button('Close AI assistant', '关闭 AI 助手').click();
      await changeTheme('dark');
      await button(copy.assistant, copy.assistant).click();
      await expect(assistant.getByText(copy.question, { exact: true })).toBeVisible();
      await page.mouse.move(2, 120);
      await capture('ai-assistant-dark');
    } finally {
      await demo.cleanup();
    }
  });
}
