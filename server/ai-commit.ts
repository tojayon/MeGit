import { createHash } from 'node:crypto';
import { diffOptions } from '../shared/git-commands.js';
import { AppError } from './errors.js';
import { readRepository, runGit } from './git.js';

async function fingerprint(repo: string) {
  const state = await readRepository(repo);
  if (state.files.some((file) => file.conflicted)) throw new AppError('resolveConflicts');
  if (!state.staged) throw new AppError('stageRequired');
  const raw = await runGit(repo, [
    'diff',
    '--cached',
    '--no-ext-diff',
    '--no-textconv',
    '--raw',
    '--no-abbrev',
    '--no-renames',
  ]);
  return createHash('sha256')
    .update(JSON.stringify([state.head, state.branch, raw.stdout]))
    .digest('hex');
}

export async function readCommitContext(repo: string) {
  const before = await fingerprint(repo);
  const { stdout } = await runGit(repo, ['diff', '--cached', ...diffOptions], false, false, 48000);
  if (before !== (await fingerprint(repo))) throw new AppError('aiCommitChanged', 409);
  return { patch: stdout.slice(0, 48000), truncated: stdout.length > 48000, fingerprint: before };
}

export function commitMessage(output: string) {
  const text = output.trim();
  if (
    !text ||
    text.length > 240 ||
    text.includes('```') ||
    [...text].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new AppError('aiCommitOutput', 502);
  return text;
}
