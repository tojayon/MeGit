import { describe, expect, it } from 'vitest';
import {
  actionArguments,
  commitDiffArguments,
  createBranchArguments,
  fileDiffArguments,
  formatGitCommand,
  historyArguments,
} from '../shared/git-commands';
import type { ChangedFile } from '../shared/types';

const file: ChangedFile = {
  path: "新目录/a'$`;.txt",
  originalPath: 'old name.txt',
  indexStatus: 'R',
  worktreeStatus: '.',
  untracked: false,
  conflicted: false,
};
const state = { head: 'a'.repeat(40), files: [file], pushTarget: null };

describe('Git command preview contracts', () => {
  it('PowerShell display preserves apostrophes and shell characters as a single literal argument', () => {
    const code = formatGitCommand(['commit', '-m', "a'$env:TEMP`;\n第二行"]);
    expect(code).toContain("commit -m 'a''$env:TEMP`;\n第二行'");
    expect(code).toContain('--literal-pathspecs');
    expect(code).toContain('core.quotepath=false');
    expect(formatGitCommand(['switch', '--', '@feature'])).toContain("-- '@feature'");
  });
  it('renames preserve both paths and literal path handling while duplicates are removed', () => {
    const args = actionArguments({ type: 'stage', paths: [file.path, file.path] }, state)!;
    expect(args.slice(0, 2)).toEqual(['add', '--']);
    expect(args.slice(2)).toEqual([file.path, file.originalPath]);
    expect(actionArguments({ type: 'stage', paths: ['stale.txt'] }, state)).toBeNull();
  });
  it('unstaging before the first commit removes only the index entry; later it uses restore', () => {
    const operation = { type: 'unstage', paths: [file.path] } as const;
    expect(
      actionArguments(
        { ...operation, paths: [...operation.paths] },
        { ...state, head: null },
      )?.slice(0, 3),
    ).toEqual(['rm', '--cached', '--']);
    expect(
      actionArguments({ ...operation, paths: [...operation.paths] }, state)?.slice(0, 3),
    ).toEqual(['restore', '--staged', '--']);
  });
  it('tracking creation uses the full remote ref; non-tracking creation pins the verified commit', () => {
    const options = {
      name: 'feature/new',
      startPoint: 'refs/remotes/team/feature/base',
      startHash: state.head,
      track: true,
      checkout: false,
    };
    expect(createBranchArguments(options).at(-1)).toBe(options.startPoint);
    expect(createBranchArguments({ ...options, track: false }).at(-1)).toBe(state.head);
    expect(createBranchArguments({ ...options, checkout: true })).toContain(
      '--no-overwrite-ignore',
    );
  });
  it('push never guesses its destination from an upstream display name', () => {
    expect(actionArguments({ type: 'push' }, state)).toBeNull();
    const destination = { remote: 'team', ref: 'refs/heads/release/different-name' };
    expect(
      actionArguments({ type: 'push' }, { ...state, pushTarget: destination, upstreamHead: 'b'.repeat(40) })?.slice(-2),
    ).toEqual(['team', `${state.head}:refs/heads/release/different-name`]);
  });
  it('untracked file viewing does not invent a Git diff command; rename diff includes original path', () => {
    expect(fileDiffArguments({ ...file, untracked: true }, false)).toBeNull();
    expect(fileDiffArguments(file, true)).toContain('--cached');
    expect(fileDiffArguments(file, false)?.slice(-2)).toEqual([file.path, file.originalPath]);
  });
  it('commit diff keeps first-parent merge semantics and history previews keep the current offset', () => {
    expect(commitDiffArguments(state.head)).toContain('--diff-merges=first-parent');
    expect(commitDiffArguments(state.head).slice(-2)).toEqual([state.head, '--']);
    expect(historyArguments(80)).toContain('--skip=80');
    expect(actionArguments({ type: 'commit', message: '  实际说明  ' }, state)).toEqual([
      'commit',
      '-m',
      '实际说明',
    ]);
  });
});
