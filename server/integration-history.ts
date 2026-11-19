import type { Commit, IntegrationHistory } from '../shared/types.js';
import { inspectIntegration, runGit } from './git.js';
import { AppError } from './errors.js';

const format = '--format=%H%x1f%P%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s';
function parse(raw: string): Commit[] {
  return raw
    .split('\0')
    .filter((row) => row.trim())
    .map((row) => {
      const [hash, parents, shortHash, author, date, refs, ...subject] = row
        .trimStart()
        .split('\x1f');
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        shortHash,
        author,
        date,
        refs,
        subject: subject.join('\x1f'),
      };
    });
}
async function log(repo: string, args: string[]) {
  return parse(
    (
      await runGit(repo, [
        'log',
        '-z',
        '--no-show-signature',
        '--no-decorate',
        format,
        ...args,
        '--',
      ])
    ).stdout,
  );
}
async function ancestor(repo: string, source: string, target: string) {
  const result = await runGit(repo, ['merge-base', '--all', source, target], false, true);
  return result.stdout.trim().split('\n').includes(source);
}

export async function readIntegrationHistory(
  source: string,
  target: string,
  sourceRef: string,
  targetRef: string,
  options: { sourceHash?: string; targetHash?: string; offset?: number; limit?: number } = {},
): Promise<IntegrationHistory> {
  const comparison = await inspectIntegration(source, target, sourceRef, targetRef);
  const { sourceHead, targetHead } = comparison;
  if (
    (options.sourceHash && options.sourceHash !== sourceHead) ||
    (options.targetHash && options.targetHash !== targetHead)
  )
    throw new AppError('branchTargetChanged', 409);
  const [sourceTip, targetTip, sourceShallow, targetShallow] = await Promise.all([
    sourceHead ? log(source, ['-1', sourceHead]).then((rows) => rows[0] || null) : null,
    targetHead ? log(target, ['-1', targetHead]).then((rows) => rows[0] || null) : null,
    runGit(source, ['rev-parse', '--is-shallow-repository']),
    runGit(target, ['rev-parse', '--is-shallow-repository']),
  ]);
  const detail: IntegrationHistory = {
    comparison,
    sourceTip,
    targetTip,
    commonBases: [],
    includedAt: null,
    shallow: sourceShallow.stdout.trim() === 'true' || targetShallow.stdout.trim() === 'true',
    sourceOnly: { commits: [], total: null, hasMore: false },
    targetOnly: { commits: [], total: null, hasMore: false },
  };
  if (!sourceHead || !targetHead || comparison.state === 'unknown') return detail;
  // Use immutable object IDs from this comparison, never moving refs, for every subsequent read.
  const bases = (await runGit(target, ['merge-base', '--all', sourceHead, targetHead])).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  detail.commonBases = (await Promise.all(bases.map((hash) => log(target, ['-1', hash])))).flat();
  const offset = options.offset ?? 0,
    limit = options.limit ?? 30;
  for (const [key, tip] of [
    ['sourceOnly', sourceHead],
    ['targetOnly', targetHead],
  ] as const) {
    // Show development descending from any best common ancestor, excluding their
    // shared history. In C→D / C→M→T this keeps M but omits M's older side parent S.
    // All excluded bases are bottom commits for --ancestry-path; do not pick one.
    const range = ['--ancestry-path', tip, ...bases.map((hash) => `^${hash}`)];
    const [count, commits] = await Promise.all([
      runGit(target, ['rev-list', '--count', ...range]),
      log(target, ['--topo-order', `--skip=${offset}`, `--max-count=${limit}`, ...range]),
    ]);
    const total = Number(count.stdout.trim());
    detail[key] = { commits, total, hasMore: offset + commits.length < total };
  }
  if (comparison.state === 'integrated') {
    // First-parent membership is monotone: binary search the oldest target mainline
    // commit that already contains sourceHead. This does not infer a merge action.
    const count = Number(
      (await runGit(target, ['rev-list', '--first-parent', '--count', targetHead])).stdout.trim(),
    );
    let newest = 0,
      oldest = count - 1;
    while (newest < oldest) {
      const middle = Math.ceil((newest + oldest) / 2);
      const [commit] = await log(target, ['--first-parent', `--skip=${middle}`, '-1', targetHead]);
      if (await ancestor(target, sourceHead, commit.hash)) newest = middle;
      else oldest = middle - 1;
    }
    detail.includedAt =
      (await log(target, ['--first-parent', `--skip=${newest}`, '-1', targetHead]))[0] || null;
  }
  return detail;
}
