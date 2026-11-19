import type { BranchComparison, BranchTreeData, Commit, TreeBranch } from '../shared/types.js';
import { AppError } from './errors.js';
import { runGit } from './git.js';
import { remoteDestination } from './remote-destination.js';
import { comparisonArguments, treeHistoryArguments } from '../shared/git-commands.js';

const logFormat = '--format=%H%x1f%P%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s';
const refFormat =
  [
    '%(refname)',
    '%(HEAD)',
    '%(objectname)',
    '%(parent)',
    '%(symref)',
    '%(upstream)',
    '%(upstream:track)',
    '%(subject)',
    '%(authorname)',
    '%(authordate:iso-strict)',
    '%(upstream:remotename)',
    '%(upstream:remoteref)',
  ].join('%00') + '%00';

function parseLog(raw: string): Commit[] {
  return raw
    .split('\0')
    .filter(Boolean)
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

async function references(repo: string) {
  const [refs, worktrees, headResult, currentResult, shallowResult, remoteConfig] =
    await Promise.all([
      runGit(repo, [
        'for-each-ref',
        '--sort=-committerdate',
        '--format=' + refFormat,
        'refs/heads',
        'refs/remotes',
      ]),
      runGit(repo, ['worktree', 'list', '--porcelain', '-z']),
      runGit(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'], false, true),
      runGit(repo, ['symbolic-ref', '-q', 'HEAD'], false, true),
      runGit(repo, ['rev-parse', '--is-shallow-repository']),
      runGit(repo, ['config', '--null', '--get-regexp', '^remote\\..*\\.url$'], false, true),
    ]);
  const remotes = new Map<string, string>();
  for (const entry of remoteConfig.stdout.split('\0')) {
    const separator = entry.indexOf('\n');
    const name = entry.slice(7, separator - 4);
    if (separator > 0 && !remotes.has(name)) remotes.set(name, entry.slice(separator + 1));
  }
  const remoteNames = [...remotes.keys()].sort((first, second) => second.length - first.length);
  const directories = new Map<string, string>();
  let directory = '';
  for (const field of worktrees.stdout.split('\0')) {
    if (field.startsWith('worktree ')) directory = field.slice(9).replaceAll('\\', '/');
    if (field.startsWith('branch ') && directory) directories.set(field.slice(7), directory);
    if (!field) directory = '';
  }
  let defaultRemote: string | undefined;
  const branches: TreeBranch[] = [];
  for (const row of refs.stdout.split('\0\n').filter(Boolean)) {
    const [
      ref,
      current,
      hash,
      parent,
      symref,
      upstream,
      tracking,
      subject,
      author,
      date,
      upstreamRemote,
      upstreamRef,
    ] = row.split('\0');
    if (symref) {
      if (ref.endsWith('/HEAD') && !defaultRemote) defaultRemote = symref;
      continue;
    }
    if (!ref?.startsWith('refs/')) continue;
    const remote = ref.startsWith('refs/remotes/');
    const ahead = tracking?.match(/ahead (\d+)/);
    const behind = tracking?.match(/behind (\d+)/);
    const gone = tracking === '[gone]';
    const remoteRef = ref.slice(13);
    const destinationRemote = remote
      ? remoteNames.find((name) => remoteRef.startsWith(`${name}/`))
      : upstreamRemote;
    const destinationBranch = remote
      ? remoteRef.slice((destinationRemote?.length ?? 0) + 1)
      : upstreamRef?.startsWith('refs/heads/')
        ? upstreamRef.slice(11)
        : '';
    const address = destinationRemote ? remotes.get(destinationRemote) : undefined;
    branches.push({
      ref,
      name: ref.slice(remote ? 13 : 11),
      remote,
      hash,
      current: current === '*',
      inWorktree: directories.has(ref),
      worktreePath: directories.get(ref),
      parents: parent ? parent.split(' ') : [],
      subject,
      author,
      date,
      upstream: upstream || null,
      upstreamGone: gone,
      remoteDestination:
        address && !gone ? remoteDestination(repo, address, destinationBranch) : undefined,
      ahead: upstream && !gone ? Number(ahead?.[1] || 0) : null,
      behind: upstream && !gone ? Number(behind?.[1] || 0) : null,
    });
  }
  const head = headResult.stdout.trim() || null;
  const currentRef = head ? currentResult.stdout.trim() || null : null;
  const local = branches.filter((branch) => !branch.remote);
  const remoteName = defaultRemote?.replace(/^refs\/remotes\/[^/]+\//, '');
  const defaultBase =
    local.find((branch) => branch.name === remoteName)?.ref ||
    local.find((branch) => branch.name === 'main')?.ref ||
    local.find((branch) => branch.name === 'master')?.ref ||
    currentRef ||
    local[0]?.ref ||
    (head ? 'HEAD' : null);
  return {
    branches,
    head,
    currentRef,
    detached: !!head && !currentRef,
    defaultBase,
    shallow: shallowResult.stdout.trim() === 'true',
  };
}

function selectedRef(ref: string, data: Awaited<ReturnType<typeof references>>) {
  if (ref === 'HEAD' && data.head) return data.head;
  if (!/^refs\/(heads|remotes)\//.test(ref)) throw new AppError('invalidRef');
  const branch = data.branches.find((branch) => branch.ref === ref);
  if (!branch) throw new AppError('invalidRef');
  return branch.hash;
}

export async function readBranchTree(
  repo: string,
  options: { baseRef?: string; limit?: number; includeRemote?: boolean } = {},
): Promise<BranchTreeData> {
  const data = await references(repo);
  const limit = Math.max(1, Math.min(600, Math.floor(options.limit || 120)));
  const baseRef = options.baseRef || data.defaultBase;
  const baseHash = baseRef ? selectedRef(baseRef, data) : null;
  const branches = data.branches.filter(
    (branch) => options.includeRemote || !branch.remote || branch.ref === baseRef,
  );
  const commits =
    data.head || branches.length
      ? parseLog(
          (
            await runGit(
              repo,
              treeHistoryArguments(limit, !!options.includeRemote, data.head, baseHash),
            )
          ).stdout,
        )
      : [];
  const hasMore = commits.length > limit;
  const bounded = new Map(commits.slice(0, limit).map((commit) => [commit.hash, commit]));
  for (const branch of branches) {
    if (!bounded.has(branch.hash))
      bounded.set(branch.hash, {
        hash: branch.hash,
        shortHash: branch.hash.slice(0, 7),
        parents: branch.parents,
        subject: branch.subject,
        author: branch.author,
        date: branch.date,
        refs: branch.ref,
      });
  }
  if (data.head && !bounded.has(data.head)) {
    const headCommit = parseLog(
      (await runGit(repo, ['show', '-s', '-z', logFormat, data.head, '--'])).stdout,
    )[0];
    if (headCommit) bounded.set(headCommit.hash, headCommit);
  }
  return {
    branches,
    commits: [...bounded.values()].map((commit) =>
      data.shallow && !commit.parents.length ? { ...commit, rootUnconfirmed: true } : commit,
    ),
    baseRef,
    head: data.head,
    currentRef: data.currentRef,
    detached: data.detached,
    hasMore,
    limit,
    shallow: data.shallow,
    checkedAt: new Date().toISOString(),
  };
}

export async function compareBranches(
  repo: string,
  options: { sourceRef: string; targetRef: string; sourceHash?: string; targetHash?: string },
): Promise<BranchComparison> {
  const data = await references(repo);
  const sourceHash = selectedRef(options.sourceRef, data);
  const targetHash = selectedRef(options.targetRef, data);
  if (
    (options.sourceHash && options.sourceHash !== sourceHash) ||
    (options.targetHash && options.targetHash !== targetHash)
  )
    throw new AppError('branchTargetChanged', 409);
  const commands = comparisonArguments(sourceHash, targetHash);
  const [counts, source, target, bases] = await Promise.all([
    runGit(repo, commands[0]),
    runGit(repo, commands[1]),
    runGit(repo, commands[2]),
    runGit(repo, commands[3], false, true),
  ]);
  const [sourceOnly, targetOnly] = counts.stdout.trim().split(/\s+/).map(Number);
  const mergeBases = bases.stdout.trim().split(/\s+/).filter(Boolean);
  const relation =
    sourceHash === targetHash
      ? 'same'
      : !mergeBases.length
        ? data.shallow
          ? 'unknown'
          : 'unrelated'
        : sourceOnly === 0
          ? 'included'
          : targetOnly === 0
            ? 'ahead'
            : 'diverged';
  return {
    sourceRef: options.sourceRef,
    targetRef: options.targetRef,
    sourceHash,
    targetHash,
    sourceOnly,
    targetOnly,
    mergeBases,
    relation,
    sourceCommits: source.stdout.trim().split(/\s+/).filter(Boolean),
    targetCommits: target.stdout.trim().split(/\s+/).filter(Boolean),
    checkedAt: new Date().toISOString(),
  };
}
