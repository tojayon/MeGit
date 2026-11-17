import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function selectBranch(panel: Page | Locator, name: string, english = false) {
  await panel
    .getByRole('button', { name: `${english ? 'View branch ' : '查看分支 '}${name}`, exact: true })
    .click();
}

export async function openRepositoryTools(
  page: Page,
  view: 'worktree' | 'history',
  panel: Page | Locator = page,
  english = false,
) {
  const current = page.getByRole('dialog', {
    name: english ? /^(Working tree|History)$/ : /^(工作区|提交历史)$/,
  });
  if (await current.count()) {
    await current
      .getByRole('button', {
        name: english ? /^Close (Working tree|History)$/ : /^关闭(工作区|提交历史)$/,
        exact: true,
      })
      .click();
  }
  const tools = panel.getByRole('button', {
    name: english ? 'Branch tree tools' : '分支树工具',
    exact: true,
  });
  // Wait for the explicitly requested smooth reveal before using its anchored menu.
  await expect
    .poll(() =>
      tools.evaluate((element) => {
        const card = element.closest('.dock-card');
        const dock = element.closest('.dock-panels');
        if (!card || !dock) return true;
        const a = card.getBoundingClientRect();
        const b = dock.getBoundingClientRect();
        return a.width > b.width || (a.left >= b.left - 1 && a.right <= b.right + 1);
      }),
    )
    .toBe(true);
  await tools.click();
  await panel
    .getByRole('button', {
      name: english
        ? view === 'worktree'
          ? /^View working changes/
          : 'View commit history'
        : view === 'worktree'
          ? /^查看工作区改动/
          : '查看提交历史',
      exact: view !== 'worktree',
    })
    .click();
  const dialog = page.getByRole('dialog', {
    name: english
      ? view === 'worktree'
        ? 'Working tree'
        : 'History'
      : view === 'worktree'
        ? '工作区'
        : '提交历史',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
