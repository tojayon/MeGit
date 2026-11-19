import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './test';
import { fixture, commitFile, git } from '../tests/fixtures';

test('AI 提交说明只发送暂存内容，保留草稿与真实 Git 状态并拒绝过期结果', async ({
  page,
  request,
}) => {
  const f = await fixture();
  const bodies: string[] = [];
  let cancelled = 0;
  let output = 'feat: add staged feature';
  let gate: Promise<void> = Promise.resolve();
  const upstream = createServer(async (req, res) => {
    res.on('close', () => {
      if (!res.writableFinished) cancelled++;
    });
    let body = '';
    for await (const chunk of req) body += chunk;
    bodies.push(body);
    await gate;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: output } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Missing port');
    const head = await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'feature.txt'), 'staged-feature\n');
    const { token } = await (await request.get('/api/session')).json();
    const headers = { 'X-MeGit-Token': token };
    expect(
      (
        await request.put('/api/ai/settings', {
          headers,
          data: {
            endpoint: `http://127.0.0.1:${address.port}/v1`,
            model: 'test-model',
            apiKey: '',
          },
        })
      ).ok(),
    ).toBe(true);
    const send = (repositoryId: string, auth = true) =>
      request.post('/api/ai/assist', {
        headers: auth ? headers : {},
        data: { kind: 'commit', repositoryId, language: 'en' },
      });
    expect((await send('ai-commit', false)).status()).toBe(403);
    expect((await send('unknown')).status()).toBe(404);
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    workspace.repositories = [{ id: 'ai-commit', name: 'AI 示例', path: f.repo }];
    workspace.boards[0].nodes = [{ id: 'ai-node', repoId: 'ai-commit', position: { x: 0, y: 0 } }];
    expect((await request.put('/api/workspace', { headers, data: workspace })).ok()).toBe(true);
    expect(await (await send('ai-commit')).json()).toMatchObject({ code: 'stageRequired' });
    expect(bodies).toHaveLength(0);
    await git(f.repo, 'add', '--', 'feature.txt');
    await writeFile(path.join(f.repo, 'feature.txt'), 'unstaged-private-content\n');
    await writeFile(path.join(f.repo, 'secret.txt'), 'untracked-secret\n');
    await page.goto('/');
    const card = page.getByTestId('repository-node');
    const input = card.getByLabel('提交说明', { exact: true });
    const generate = card.getByRole('button', { name: 'AI 生成提交说明', exact: true });
    await input.fill('原有草稿');
    await card.getByRole('button', { name: '查看AI 示例', exact: true }).click();
    await page.getByRole('button', { name: '查看分支 main', exact: true }).click();
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await generate.click();
    await expect(generate).toBeDisabled();
    await expect(input).toBeDisabled();
    await expect(
      page.locator('.branch-tree-selection').getByLabel('提交说明', { exact: true }),
    ).toBeDisabled();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toContain('staged-feature');
    expect(bodies[0]).not.toMatch(/unstaged-private-content|untracked-secret|secret.txt/);
    release();
    await expect(input).toHaveValue(output);
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'diff', '--cached')).toContain('staged-feature');
    expect(await git(f.repo, 'diff')).toContain('unstaged-private-content');
    await page.reload();
    await expect(input).toHaveValue(output);
    output = 'invalid\nmessage';
    await generate.click();
    await expect(card.getByRole('alert')).toContainText('单行提交说明');
    await expect(input).toHaveValue('feat: add staged feature');
    output = 'feat: stale result';
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await generate.click();
    await expect.poll(() => bodies.length).toBe(3);
    await git(f.repo, 'add', '--', 'feature.txt');
    release();
    await expect(card.getByRole('alert')).toContainText('已变化');
    await expect(input).toHaveValue('feat: add staged feature');
    output = 'fix: updated staged feature';
    gate = Promise.resolve();
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('button', { name: '明亮', exact: true }).click();
    await page.getByLabel('界面语言').selectOption('en');
    await page.keyboard.press('Escape');
    const english = card.getByRole('button', {
      name: 'Generate commit message with AI',
      exact: true,
    });
    await english.focus();
    await expect(page.getByRole('tooltip')).toContainText('diff --cached');
    await expect(page.getByRole('tooltip')).toContainText('48,000');
    await page.keyboard.press('Escape');
    await english.click();
    await expect(card.getByLabel('Commit message', { exact: true })).toHaveValue(output);
    expect(JSON.parse(bodies[3]).messages[0].content).toContain('English');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    await page.screenshot({ path: '.megit/verification/ai-commit/light.png' });
    output = '';
    await english.click();
    await expect(card.getByRole('alert')).toContainText('AI service');
    await expect(card.getByLabel('Commit message', { exact: true })).toHaveValue(
      'fix: updated staged feature',
    );
    output = 'feat: abandoned generation';
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await english.click();
    await expect.poll(() => bodies.length).toBe(6);
    await page.goto('/design-system');
    await expect.poll(() => cancelled).toBeGreaterThan(0);
    release();
    await page.goto('/');
    await expect(card.getByLabel('Commit message', { exact: true })).toHaveValue(
      'fix: updated staged feature',
    );
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await f.cleanup();
  }
});
