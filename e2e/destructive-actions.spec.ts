import type { APIRequestContext, Locator } from '@playwright/test';
import { test, expect } from './test';
import { commitFile, fixture, git } from '../tests/fixtures';
import path from 'node:path';

async function session(request: APIRequestContext) {
  const { token } = await (await request.get('/api/session')).json();
  return { 'X-MeGit-Token': token };
}

async function readWorkspace(request: APIRequestContext) {
  return (await request.get('/api/workspace', { headers: await session(request) })).json();
}

async function seed(request: APIRequestContext, repo: string, target: string) {
  const workspace = await readWorkspace(request);
  workspace.repositories = [
    { id: 'source', name: '源仓库', path: repo },
    { id: 'target', name: '目标仓库', path: target },
  ];
  Object.assign(workspace.boards[0], {
    name: '待移除流程',
    nodes: [
      { id: 'a', repoId: 'source', position: { x: 120, y: 160 } },
      { id: 'b', repoId: 'target', position: { x: 520, y: 160 } },
    ],
    edges: [
      {
        id: 'ab',
        source: 'a',
        target: 'b',
        kind: 'dependency',
        label: '开发顺序',
        sourceRef: 'HEAD',
        targetRef: 'HEAD',
      },
    ],
    groups: [{ id: 'g', name: '核心组', nodeIds: ['a', 'b'], collapsed: false }],
    notes: [{ id: 'note', title: '计划', text: '需要保留的文字', position: { x: 200, y: 460 } }],
    viewport: { x: 0, y: 0, zoom: 0.8 },
  });
  workspace.boards.push({
    id: 'keep',
    name: '保留流程',
    description: '原有说明',
    nodes: [{ id: 'kept', repoId: 'source', position: { x: 80, y: 100 } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  expect(
    (
      await request.put('/api/workspace', {
        headers: await session(request),
        data: workspace,
      })
    ).ok(),
  ).toBe(true);
  return readWorkspace(request);
}

async function expectDanger(button: Locator) {
  await expect(button.locator('svg')).toHaveCount(1);
  const colors = await button.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger)';
    element.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(element).color, danger };
  });
  expect(colors.actual).toBe(colors.danger);
}

for (const english of [false, true]) {
  test(`移除工作流必须确认，取消保留内容且确认仅移除目标，${english ? '明亮英文窄屏' : '暗黑中文'}`, async ({
    page,
    request,
  }) => {
    const f = await fixture();
    try {
      const head = await commitFile(f.repo);
      const target = path.join(f.root, 'target');
      await git(f.root, 'clone', f.repo, target);
      const original = await seed(request, f.repo, target);
      if (english) {
        await page.addInitScript(() =>
          localStorage.setItem(
            'megit.preferences',
            JSON.stringify({
              version: 1,
              theme: 'light',
              language: 'en',
              navigationCollapsed: false,
            }),
          ),
        );
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await page.goto('/');
      const options = page.getByRole('button', {
        name: english ? 'Workflow options' : '工作流选项',
        exact: true,
      });
      const remove = page.getByRole('button', {
        name: english ? 'Remove workflow' : '移除此流程',
        exact: true,
      });
      const dialog = page.getByRole('dialog', {
        name: english ? 'Remove workflow?' : '移除工作流？',
        exact: true,
      });
      for (const close of ['cancel', 'escape', 'backdrop', 'enter']) {
        await options.focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('End');
        await expect(remove).toBeFocused();
        await expectDanger(remove);
        await page.keyboard.press('Enter');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('待移除流程');
        await expect(dialog).toContainText(english ? 'cannot be undone' : '无法撤销');
        await expect(
          dialog.getByRole('button', { name: english ? 'Cancel' : '取消', exact: true }),
        ).toBeFocused();
        await expect(page.locator('.small-menu')).toHaveCount(0);
        expect((await readWorkspace(request)).boards).toEqual(original.boards);
        if (close === 'cancel')
          await dialog
            .getByRole('button', { name: english ? 'Cancel' : '取消', exact: true })
            .click();
        else if (close === 'escape') await page.keyboard.press('Escape');
        else if (close === 'backdrop') await page.mouse.click(5, 5);
        else await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(options).toBeFocused();
        expect((await readWorkspace(request)).boards).toEqual(original.boards);
      }
      await options.click();
      await remove.click();
      const confirm = dialog.getByRole('button', {
        name: english ? 'Remove workflow' : '移除工作流',
        exact: true,
      });
      await expectDanger(confirm);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `.megit/verification/destructive-actions/${english ? 'light-en-mobile' : 'dark-zh'}-confirm.png`,
        fullPage: true,
      });
      await confirm.click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await readWorkspace(request)).boards.length).toBe(1);
      const saved = await readWorkspace(request);
      expect(saved.boards).toEqual([original.boards[1]]);
      expect(saved.repositories).toEqual(original.repositories);
      expect(saved.activeBoardId).toBe('keep');
      expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
      await options.click();
      await expect(remove).toHaveCount(0);
    } finally {
      await f.cleanup();
    }
  });
}

test('可撤销的移除入口使用危险图标，撤销恢复节点、关联关系、分组与说明', async ({
  page,
  request,
}) => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', f.repo, target);
    const original = await seed(request, f.repo, target);
    await page.setViewportSize({ width: 1500, height: 960 });
    await page.goto('/');
    const undo = page.getByRole('button', { name: '撤销白板编辑', exact: true });
    const actions = [
      {
        open: () => page.getByRole('button', { name: '查看源仓库', exact: true }).click(),
        label: '从白板移除',
        absent: '.react-flow__node[data-id="a"]',
      },
      {
        open: () => page.locator('[data-edge-id="ab"]').click(),
        label: '移除关系',
        absent: '[data-edge-id="ab"]',
      },
      {
        open: () =>
          page.locator('.react-flow__node[data-id="g"]').click({ position: { x: 70, y: 20 } }),
        label: '解散分组',
        absent: '.react-flow__node[data-id="g"]',
      },
      {
        open: () =>
          page.locator('.react-flow__node[data-id="note"]').click({ position: { x: 70, y: 70 } }),
        label: '移除说明',
        absent: '.react-flow__node[data-id="note"]',
      },
    ];
    for (const action of actions) {
      await action.open();
      const button = page
        .locator('.canvas-selection-tools')
        .getByRole('button', { name: '移除所选元素', exact: true });
      await expectDanger(button);
      await button.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator(action.absent)).toHaveCount(0);
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(page.locator(action.absent)).toBeVisible();
      await expect
        .poll(async () => (await readWorkspace(request)).boards[0])
        .toEqual(original.boards[0]);
    }
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
  } finally {
    await f.cleanup();
  }
});

test('Git 分支删除在确认前不执行，默认取消且保持既有安全删除保护', async ({ page, request }) => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await git(f.repo, 'branch', 'feature');
    const target = path.join(f.root, 'target');
    await git(f.root, 'clone', f.repo, target);
    await seed(request, f.repo, target);
    await page.goto('/');
    await page.getByRole('button', { name: '查看源仓库', exact: true }).click();
    await page.getByRole('button', { name: '查看分支 feature', exact: true }).click();
    const remove = page.getByRole('button', { name: '删除 feature', exact: true });
    await expectDanger(remove);
    await remove.click();
    const dialog = page.getByRole('dialog', { name: '删除分支', exact: true });
    await expect(dialog).toContainText('源仓库');
    await expect(dialog).toContainText('feature');
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect(await git(f.repo, 'branch', '--list', 'feature')).toBe('feature');
    await remove.click();
    await dialog.getByRole('button', { name: '删除分支', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await git(f.repo, 'branch', '--list', 'feature')).toBe('');
    expect(await git(f.repo, 'branch', '--show-current')).toBe('main');
  } finally {
    await f.cleanup();
  }
});
