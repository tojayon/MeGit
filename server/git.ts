import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  BranchAction,
  ChangedFile,
  Commit,
  DiffQuery,
  DiffResult,
  GitAction,
  IntegrationState,
  RepoState,
} from '../shared/types.js';
import { AppError, safeMessage } from './errors.js';
import { isBranchName, isSafeRef } from '../shared/refs.js';

const execute = promisify(execFile);
const MAX_DIFF = 240_000;
const queues = new Map<string, Promise<unknown>>();

async function run(repo: string, args: string[], network = false, allowExitOne = false) {
  try {
    return await execute(
      'git',
      [
        '--no-pager',
        '--literal-pathspecs',
        '-c',
        'color.ui=false',
        '-c',
        'core.quotepath=false',
        ...args,
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        windowsHide: true,
        timeout: network ? 120_000 : 20_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
          LANG: 'C',
        },
      },
    );
  } catch (error) {
    const result = error as Error & { stdout?: string; stderr?: string; killed?: boolean; code?: number | string };
    if (allowExitOne && result.code === 1)
      return { stdout: result.stdout || '', stderr: result.stderr || '' };
    if (result.code === 'ENOENT') throw new AppError('gitMissing');
    if (result.killed) throw new AppError('gitTimeout', 504);
    const message = result.stderr?.trim() || safeMessage(error);
    throw new AppError('gitFailed', 422, safeMessage(new Error(message)));
  }
}

export { run as runGit };

async function optional(repo: string, args: string[]) {
  try {
    return (await run(repo, args)).stdout.trim();
  } catch {
    return null;
  }
}

export async function resolveRepository(input: string): Promise<string> {
  if (!input || input.includes('\0') || !path.isAbsolute(input)) throw new AppError('pathAbsolute');
  const directory = await realpath(input).catch(() => {
    throw new AppError('directoryMissing');
  });
  if ((await stat(directory)).isDirectory() === false) throw new AppError('directoryRequired');
  if ((await optional(directory, ['rev-parse', '--is-inside-work-tree'])) !== 'true')
    throw new AppError('notRepository');
  const root = (await run(directory, ['rev-parse', '--show-toplevel'])).stdout.trim();
  return (await realpath(root)).replaceAll('\\', '/');
}

export async function readRepository(repo: string): Promise<RepoState> {
  const [raw, refResult, remoteResult, fetchFile] = await Promise.all([
    run(repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal']),
    run(repo, [
      'for-each-ref',
      '--format=%(refname)%09%(HEAD)%09%(objectname)%09%(if)%(worktreepath)%(then)1%(else)0%(end)%09%(symref)',
      'refs/heads',
      'refs/remotes',
    ]),
    run(repo, ['remote']),
    optional(repo, ['rev-parse', '--git-path', 'FETCH_HEAD']),
  ]);
  const parts = raw.stdout.split('\0');
  const headers: Record<string, string> = {};
  const files: ChangedFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i];
    if (item.startsWith('# ')) {
      const space = item.indexOf(' ', 2);
      headers[item.slice(2, space)] = item.slice(space + 1);
    } else if (/^[12u] /.test(item)) {
      const tokens = item.split(' ');
      const renamed = item[0] === '2';
      files.push({
        path: tokens.slice(item[0] === 'u' ? 10 : renamed ? 9 : 8).join(' '),
        ...(renamed ? { originalPath: parts[++i] } : {}),
        indexStatus: tokens[1][0],
        worktreeStatus: tokens[1][1],
        untracked: false,
        conflicted: item[0] === 'u',
      });
    } else if (item.startsWith('? ')) {
      files.push({
        path: item.slice(2),
        indexStatus: '?',
        worktreeStatus: '?',
        untracked: true,
        conflicted: false,
      });
    }
  }
  const counts = headers['branch.ab']?.match(/\+(\d+) -(\d+)/);
  const fetchedAt = fetchFile
    ? await stat(path.resolve(repo, fetchFile))
        .then((s) => s.mtime.toISOString())
        .catch(() => null)
    : null;
  const operation = fetchFile
    ? await readOperation(path.dirname(path.resolve(repo, fetchFile)))
    : undefined;
  return {
    branch: headers['branch.head'] === '(detached)' ? '' : headers['branch.head'] || '',
    head:
      headers['branch.oid'] && headers['branch.oid'] !== '(initial)' ? headers['branch.oid'] : null,
    detached: headers['branch.head'] === '(detached)',
    upstream: headers['branch.upstream'] || null,
    ahead: counts ? Number(counts[1]) : null,
    behind: counts ? Number(counts[2]) : null,
    changed: files.length,
    staged: files.filter((f) => !f.untracked && f.indexStatus !== '.').length,
    files,
    ...(operation ? { operation } : {}),
    fetchedAt,
    checkedAt: new Date().toISOString(),
    remotes: remoteResult.stdout.trim().split('\n').filter(Boolean),
    branches: refResult.stdout
      .trim()
      .split('\n')
      .filter((line) => !!line && !line.split('\t')[4])
      .map((line) => {
        const [full, current, hash, occupied] = line.split('\t');
        const remote = full.startsWith('refs/remotes/');
        const name = full.slice((remote ? 'refs/remotes/' : 'refs/heads/').length);
        return { name, current: current === '*', remote, hash, inWorktree: occupied === '1' };
      }),
  };
}

async function readOperation(gitDirectory: string): Promise<RepoState['operation']> {
  const markers = [
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherryPick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect'],
    ['sequencer', 'sequencer'],
  ] as const;
  const present = await Promise.all(
    markers.map(([name]) =>
      stat(path.join(gitDirectory, name))
        .then(() => true)
        .catch(() => false),
    ),
  );
  return markers.find((_, i) => present[i])?.[1];
}

export async function getHistory(repo: string, skip = 0): Promise<Commit[]> {
  const head = await optional(repo, ['rev-parse', '--verify', 'HEAD']);
  if (!head) return [];
  const result = await run(repo, [
    'log',
    '--all',
    'HEAD',
    '--topo-order',
    '--max-count=40',
    `--skip=${Math.max(0, Math.min(100_000, Math.floor(skip)))}`,
    '-z',
    '--format=%H%x1f%P%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s',
  ]);
  return result.stdout
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

function validRef(ref: string) {
  if (!isSafeRef(ref)) throw new AppError('invalidRef');
  return ref;
}

async function commitHash(repo: string, ref: string) {
  return optional(repo, ['rev-parse', '--verify', '--end-of-options', `${validRef(ref)}^{commit}`]);
}

export async function getDiff(repo: string, query: DiffQuery): Promise<DiffResult> {
  const args = ['--no-ext-diff', '--no-textconv', '--no-color', '--unified=3'];
  if (
    query.path &&
    (query.path.includes('\0') ||
      path.isAbsolute(query.path) ||
      query.path.split(/[\\/]/).includes('..'))
  )
    throw new AppError('invalidPath');
  if (query.commit) {
    const hash = await commitHash(repo, query.commit);
    if (!hash) throw new AppError('commitMissing');
    const result = await run(repo, [
      'show',
      '--diff-merges=first-parent',
      '--format=',
      ...args,
      hash,
      '--',
      ...(query.path ? [query.path] : []),
    ]);
    return limitDiff(result.stdout);
  }
  if (!query.path) throw new AppError('fileRequired');
  const state = await readRepository(repo);
  const entry = state.files.find((f) => f.path === query.path || f.originalPath === query.path);
  if (!entry) throw new AppError('fileChanged', 409);
  if (entry.untracked) {
    const filename = await realpath(path.join(repo, entry.path));
    const relative = path.relative(await realpath(repo), filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AppError('outsideLink');
    if (!(await stat(filename)).isFile())
      return { text: '', notice: 'untrackedDirectory', truncated: false };
    const file = await open(filename, 'r');
    try {
      const buffer = Buffer.alloc(MAX_DIFF + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (buffer.subarray(0, bytesRead).includes(0))
        return { text: '', notice: 'binary', truncated: false };
      return {
        text:
          `--- /dev/null\n+++ b/${entry.path}\n` +
          buffer
            .subarray(0, Math.min(bytesRead, MAX_DIFF))
            .toString('utf8')
            .split('\n')
            .map((line) => `+${line}`)
            .join('\n'),
        truncated: bytesRead > MAX_DIFF,
      };
    } finally {
      await file.close();
    }
  }
  return limitDiff(
    (
      await run(repo, [
        'diff',
        ...args,
        ...(query.staged ? ['--cached'] : []),
        '--',
        entry.path,
        ...(entry.originalPath ? [entry.originalPath] : []),
      ])
    ).stdout,
  );
}

function limitDiff(text: string): DiffResult {
  return { text: text.slice(0, MAX_DIFF), truncated: text.length > MAX_DIFF };
}

export async function inspectIntegration(
  source: string,
  target: string,
  sourceRef = 'HEAD',
  targetRef = 'HEAD',
): Promise<IntegrationState> {
  const [sourceHead, targetHead] = await Promise.all([
    commitHash(source, sourceRef),
    commitHash(target, targetRef),
  ]);
  const base = { sourceHead, targetHead, pending: null };
  if (!sourceHead || !targetHead)
    return {
      ...base,
      state: 'unknown',
      messageCode: 'noCommits',
      message: '来源或目标还没有可用的提交。',
    };
  if (!(await optional(target, ['cat-file', '-t', sourceHead])))
    return {
      ...base,
      state: 'unknown',
      messageCode: 'missingObjects',
      message: '目标仓库尚未获取来源提交，暂时无法比较。请先配置来源远端并获取。',
    };
  const ancestor = await optional(target, ['merge-base', '--is-ancestor', sourceHead, targetHead]);
  if (ancestor !== null)
    return {
      ...base,
      state: 'integrated',
      pending: 0,
      messageCode: 'included',
      message: '目标已包含来源提交；此状态不代表已测试或已部署。',
    };
  if (!(await optional(target, ['merge-base', sourceHead, targetHead])))
    return {
      ...base,
      state: 'unknown',
      messageCode: 'noCommonHistory',
      message: '两个仓库没有可验证的共同提交历史。',
    };
  const count = Number(
    (await run(target, ['rev-list', '--count', `${targetHead}..${sourceHead}`])).stdout.trim(),
  );
  return {
    ...base,
    state: 'pending',
    pending: count,
    messageCode: 'pending',
    message: `来源有 ${count} 个提交尚未被目标包含。重写历史或 cherry-pick 需要人工核对。`,
  };
}

async function branchArguments(
  repo: string,
  state: RepoState,
  action: BranchAction,
): Promise<string[]> {
  if (!isBranchName(action.name)) throw new AppError('branchName');
  if (
    state.branch !== action.expected.branch ||
    state.head !== action.expected.head ||
    state.detached !== action.expected.detached
  )
    throw new AppError('branchStateChanged', 409);
  if (state.operation) throw new AppError('branchOperation', 409);
  if (!state.head) throw new AppError('branchNoCommits', 409);

  if (action.type === 'createBranch') {
    if ((await optional(repo, ['check-ref-format', '--branch', action.name])) === null)
      throw new AppError('branchName');
    if (state.branches.some((b) => !b.remote && b.name.toLowerCase() === action.name.toLowerCase()))
      throw new AppError('branchExists', 409);
    const start =
      action.startPoint === 'HEAD'
        ? state.head
        : state.branches.find(
            (b) => `${b.remote ? 'refs/remotes/' : 'refs/heads/'}${b.name}` === action.startPoint,
          )?.hash;
    if (!start || (action.track && !action.startPoint.startsWith('refs/remotes/')))
      throw new AppError('branchStartPoint');
    if (start !== action.startHash) throw new AppError('branchTargetChanged', 409);
    if (action.checkout && state.changed) throw new AppError('dirtyBranch', 409);
    const tracking = action.track ? '--track=direct' : '--no-track';
    // Tracking requires the full remote ref; otherwise use its verified commit ID.
    const source = action.track ? action.startPoint : start;
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
  const branch = state.branches.find((b) => !b.remote && b.name === action.name);
  if (!branch) throw new AppError('branchMissing', 409);
  if (branch.hash !== action.targetHash) throw new AppError('branchTargetChanged', 409);
  if (action.type === 'deleteBranch' && branch.current) throw new AppError('branchCurrent', 409);
  if (branch.inWorktree && !branch.current) throw new AppError('branchInWorktree', 409);
  if (action.type === 'switchBranch') {
    if (state.changed) throw new AppError('dirtyBranch', 409);
    return [
      'switch',
      '--no-guess',
      '--no-overwrite-ignore',
      '--no-recurse-submodules',
      '--',
      action.name,
    ];
  }
  if ((await optional(repo, ['merge-base', '--is-ancestor', branch.hash, state.head])) === null)
    throw new AppError('branchNotMerged', 409);
  return ['branch', '-d', '--', action.name];
}

export async function performAction(repo: string, action: GitAction): Promise<string> {
  const previous = queues.get(repo) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const state = await readRepository(repo);
      let args: string[];
      if (
        action.type === 'createBranch' ||
        action.type === 'switchBranch' ||
        action.type === 'deleteBranch'
      ) {
        args = await branchArguments(repo, state, action);
      } else if (action.type === 'stage' || action.type === 'unstage') {
        if (!action.paths.length || action.paths.length > 2000) throw new AppError('filesRequired');
        const entries = action.paths.map((p) => state.files.find((f) => f.path === p));
        if (entries.some((f) => !f)) throw new AppError('fileChanged', 409);
        const paths = [
          ...new Set(
            entries.flatMap((f) => [f!.path, ...(f!.originalPath ? [f!.originalPath] : [])]),
          ),
        ];
        args =
          action.type === 'stage'
            ? ['add', '--', ...paths]
            : state.head
              ? ['restore', '--staged', '--', ...paths]
              : ['rm', '--cached', '--', ...paths];
      } else if (action.type === 'commit') {
        if (!action.message.trim() || action.message.length > 10_000)
          throw new AppError('commitMessage');
        if (!state.staged) throw new AppError('stageRequired');
        if (state.files.some((f) => f.conflicted)) throw new AppError('resolveConflicts');
        args = ['commit', '-m', action.message.trim()];
      } else if (action.type === 'fetch') {
        if (!state.remotes.length) throw new AppError('noRemote');
        args = ['fetch', '--all', '--no-recurse-submodules'];
      } else {
        if (!state.upstream || state.detached) throw new AppError('noUpstream');
        if (action.type === 'pull' && state.changed) throw new AppError('dirtyPull');
        if (action.type === 'pull') args = ['pull', '--ff-only', '--no-recurse-submodules'];
        else {
          const remote = await optional(repo, ['config', '--get', `branch.${state.branch}.remote`]);
          const merge = await optional(repo, ['config', '--get', `branch.${state.branch}.merge`]);
          if (
            !remote ||
            remote.startsWith('-') ||
            remote === '.' ||
            !merge?.startsWith('refs/heads/')
          )
            throw new AppError('pushConfig');
          args = ['push', '--porcelain', '--', remote, `HEAD:${merge}`];
        }
      }
      const result = await run(repo, args, ['fetch', 'pull', 'push'].includes(action.type));
      return safeMessage(new Error((result.stdout + result.stderr).trim() || 'OK'));
    });
  queues.set(repo, next);
  try {
    return await next;
  } finally {
    if (queues.get(repo) === next) queues.delete(repo);
  }
}
