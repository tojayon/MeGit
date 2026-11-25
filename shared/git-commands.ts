import type { ChangedFile, GitAction, RepoState } from './types.js';

export const gitExecutionOptions = [
  '--no-pager',
  '--literal-pathspecs',
  '-c',
  'color.ui=false',
  '-c',
  'core.quotepath=false',
];
export const diffOptions = ['--no-ext-diff', '--no-textconv', '--no-color', '--unified=3'];
export const prepareMergeArguments = (hash: string, marker?: string) => [
  '-c', 'submodule.recurse=false', '-c', 'rerere.enabled=false',
  'merge', '--no-ff', '--no-commit', '--no-squash', '--no-edit', '--no-autostash',
  '--no-overwrite-ignore', ...(marker ? ['-m', marker] : []), '--', hash,
];
export function httpRemoteHasCredentials(address: string) {
  return /^https?:\/\/[^/\\?#]*@/i.test(address);
}

export const commitLogFormat = '--format=%H%x1f%P%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s';
export const statusArguments = [
  'status',
  '--porcelain=v2',
  '--branch',
  '-z',
  '--untracked-files=normal',
];

export function createBranchArguments(
  action: Pick<
    Extract<GitAction, { type: 'createBranch' }>,
    'name' | 'track' | 'startPoint' | 'startHash' | 'checkout'
  >,
): string[] {
  const tracking = action.track ? '--track=direct' : '--no-track';
  const source = action.track ? action.startPoint : action.startHash;
  return action.checkout
    ? [
        'switch',
        '--no-guess',
        '--no-overwrite-ignore',
        '--no-recurse-submodules',
        tracking,
        '-c',
        action.name,
        '--',
        source,
      ]
    : ['branch', tracking, '--', action.name, source];
}

export function pushBranchArguments(remote: string, ref: string, source: string, oldHash: string) {
  return [
    '-c', `remote.${remote}.mirror=false`, 'push', '--porcelain', '--no-follow-tags',
    '--recurse-submodules=no', '--no-set-upstream', `--force-with-lease=${ref}:${oldHash}`,
    '--', remote, `${source}:${ref}`,
  ];
}

export function actionArguments(
  action: GitAction,
  state: Pick<RepoState, 'head' | 'files' | 'pushTarget' | 'upstreamHead'> | undefined,
): string[] | null {
  if (!state) return null;
  switch (action.type) {
    case 'createBranch':
      return createBranchArguments(action);
    case 'switchBranch':
      return [
        'switch',
        '--no-guess',
        '--no-overwrite-ignore',
        '--no-recurse-submodules',
        '--',
        action.name,
      ];
    case 'deleteBranch':
      return ['branch', '-d', '--', action.name];
    case 'stage':
    case 'unstage': {
      const files = action.paths.map((name) => state.files.find((file) => file.path === name));
      if (!files.length || files.some((file) => !file)) return null;
      const paths = [
        ...new Set(
          files.flatMap((file) => [
            file!.path,
            ...(file!.originalPath ? [file!.originalPath] : []),
          ]),
        ),
      ];
      return action.type === 'stage'
        ? ['add', '--', ...paths]
        : [
            state.head ? 'restore' : 'rm',
            ...(state.head ? ['--staged'] : ['--cached']),
            '--',
            ...paths,
          ];
    }
    case 'commit':
      return action.message.trim() ? ['commit', '-m', action.message.trim()] : null;
    case 'fetch':
      return ['fetch', '--all', '--prune', '--no-recurse-submodules'];
    case 'fetchRemote':
      return ['fetch', '--prune', '--no-recurse-submodules', '--', action.remote];
    case 'addRemote':
      return ['remote', 'add', '--', action.name, action.destination];
    case 'publishBranch':
      return action.expected.head
        ? pushBranchArguments(action.remote, `refs/heads/${action.name}`, action.expected.head, '')
        : null;
    case 'setTracking':
      return ['-c', 'branch.autoSetupRebase=never', 'branch', `--set-upstream-to=${action.targetRef}`, '--', action.expected.branch];
    case 'pull':
      return state.pushTarget
        ? ['pull', '--ff-only', '--no-rebase', '--no-squash', '--no-autostash', '--no-recurse-submodules', '--no-tags', '--', state.pushTarget.remote, state.pushTarget.ref]
        : null;
    case 'push':
      return state.pushTarget && state.head && state.upstreamHead
        ? pushBranchArguments(state.pushTarget.remote, state.pushTarget.ref, state.head, state.upstreamHead)
        : null;
  }
}

export function commitDiffArguments(hash: string, path?: string): string[] {
  return [
    'show',
    '--diff-merges=first-parent',
    '--format=',
    ...diffOptions,
    hash,
    '--',
    ...(path ? [path] : []),
  ];
}

export function fileDiffArguments(file: ChangedFile, staged: boolean): string[] | null {
  if (file.untracked) return null;
  return [
    'diff',
    ...diffOptions,
    ...(staged ? ['--cached'] : []),
    '--',
    file.path,
    ...(file.originalPath ? [file.originalPath] : []),
  ];
}

export function historyArguments(skip = 0, ref?: string): string[] {
  return [
    'log',
    ...(ref ? [ref] : ['--all', 'HEAD']),
    '--topo-order',
    '--max-count=40',
    `--skip=${Math.max(0, Math.min(100_000, Math.floor(skip)))}`,
    '-z',
    commitLogFormat,
  ];
}

export function treeHistoryArguments(
  limit: number,
  includeRemote: boolean,
  head: string | null,
  baseHash: string | null,
): string[] {
  return [
    'log',
    '--topo-order',
    '--max-count=' + (limit + 1),
    '-z',
    commitLogFormat,
    '--branches',
    ...(includeRemote ? ['--remotes'] : []),
    ...(head ? ['HEAD'] : []),
    ...(baseHash ? [baseHash] : []),
    '--',
  ];
}

export function comparisonArguments(source: string, target: string): string[][] {
  return [
    ['rev-list', '--left-right', '--count', `${source}...${target}`],
    ['rev-list', '--topo-order', '--max-count=600', `${target}..${source}`],
    ['rev-list', '--topo-order', '--max-count=600', `${source}..${target}`],
    ['merge-base', '--all', source, target],
  ];
}

// Single quotes preserve PowerShell metacharacters, including $, backticks and newlines.
// This text is display-only; the server always executes its validated argument array.
export function formatGitCommand(args: string[]): string {
  const quote = (value: string) =>
    /^[a-zA-Z0-9_./:@=,+-]+$/.test(value) && !value.startsWith('@')
      ? value
      : `'${value.replaceAll("'", "''")}'`;
  return ['git', ...gitExecutionOptions, ...args].map(quote).join(' ');
}
