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
import {
  actionArguments,
  commitDiffArguments,
  fileDiffArguments,
  gitExecutionOptions,
  historyArguments,
  statusArguments,
} from '../shared/git-commands.js';

const execute = promisify(execFile);
const MAX_DIFF = 240_000;
const queues = new Map<string, Promise<unknown>>();

async function run(repo: string, args: string[], network = false, allowExitOne = false) {
  try {
    return await execute('git', [...gitExecutionOptions, ...args], {
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
    });
  } catch (error) {
    const result = error as Error & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      code?: number | string;
    };
    if (allowExitOne && result.code === 1)
      return { stdout: result.stdout || '', stderr: result.stderr || '' };
    if (result.code === 'ENOENT') throw new AppError('gitMissing');
    if (result.killed) throw new AppError('gitTimeout', 504);
    const message = result.stderr?.trim() || safeMessage(error);
    if (args[0] === 'fetch' && /fatal: couldn't find remote ref refs\/heads\//.test(message))
      throw new AppError('remoteRefMissing', 422, safeMessage(new Error(message)));
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
    run(repo, statusArguments),
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
  const branch = headers['branch.head'] === '(detached)' ? '' : headers['branch.head'] || '';
  const upstream = headers['branch.upstream'] || null;
  const remoteNames = remoteResult.stdout.trim().split('\n').filter(Boolean);
  let pushTarget: RepoState['pushTarget'] = null;
  if (branch && upstream) {
    const [remote, ref] = await Promise.all([
      optional(repo, ['config', '--get', `branch.${branch}.remote`]),
      optional(repo, ['config', '--get', `branch.${branch}.merge`]),
    ]);
    if (
      remote &&
      remoteNames.includes(remote) &&
      !remote.startsWith('-') &&
      remote !== '.' &&
      ref?.startsWith('refs/heads/')
    )
      pushTarget = { remote, ref };
  }
  return {
    branch,
    head:
      headers['branch.oid'] && headers['branch.oid'] !== '(initial)' ? headers['branch.oid'] : null,
    detached: headers['branch.head'] === '(detached)',
    upstream,
    pushTarget,
    ahead: counts ? Number(counts[1]) : null,
    behind: counts ? Number(counts[2]) : null,
    changed: files.length,
    staged: files.filter((f) => !f.untracked && f.indexStatus !== '.').length,
    files,
    ...(operation ? { operation } : {}),
    fetchedAt,
    checkedAt: new Date().toISOString(),
    remotes: remoteNames,
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
  const result = await run(repo, historyArguments(skip));
  const shallow =
    (await run(repo, ['rev-parse', '--is-shallow-repository'])).stdout.trim() === 'true';
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
        ...(shallow && !parents ? { rootUnconfirmed: true } : {}),
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
    const result = await run(repo, commitDiffArguments(hash, query.path));
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
  return limitDiff((await run(repo, fileDiffArguments(entry, !!query.staged)!)).stdout);
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
    let start =
      action.startPoint === 'HEAD'
        ? state.head
        : state.branches.find(
            (b) => `${b.remote ? 'refs/remotes/' : 'refs/heads/'}${b.name}` === action.startPoint,
          )?.hash;
    if (action.startPoint === 'COMMIT') {
      if (action.track) throw new AppError('branchStartPoint');
      const hash = action.startHash;
      // Accept a literal complete object ID, never a revision expression or peeled tag.
      if (
        !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(hash) ||
        (await optional(repo, ['cat-file', '-t', hash])) !== 'commit'
      )
        throw new AppError('commitMissing', 409);
      const inHead = await optional(repo, ['merge-base', '--is-ancestor', hash, state.head]);
      if (inHead === null) {
        const containing = await optional(repo, [
          'for-each-ref',
          `--contains=${hash}`,
          '--format=%(refname)',
          'refs/heads/',
          'refs/remotes/',
        ]);
        const actualRefs = new Set(
          state.branches.map((b) => `${b.remote ? 'refs/remotes/' : 'refs/heads/'}${b.name}`),
        );
        if (!containing?.split('\n').some((ref) => actualRefs.has(ref.trim())))
          throw new AppError('commitMissing', 409);
      }
      start = hash;
    }
    if (!start || (action.track && !action.startPoint.startsWith('refs/remotes/')))
      throw new AppError('branchStartPoint');
    if (start !== action.startHash) throw new AppError('branchTargetChanged', 409);
    if (action.checkout && state.changed) throw new AppError('dirtyBranch', 409);
    return actionArguments(action, state)!;
  }
  const branch = state.branches.find((b) => !b.remote && b.name === action.name);
  if (!branch) throw new AppError('branchMissing', 409);
  if (branch.hash !== action.targetHash) throw new AppError('branchTargetChanged', 409);
  if (action.type === 'deleteBranch' && branch.current) throw new AppError('branchCurrent', 409);
  if (branch.inWorktree && !branch.current) throw new AppError('branchInWorktree', 409);
  if (action.type === 'switchBranch') {
    if (state.changed) throw new AppError('dirtyBranch', 409);
    return actionArguments(action, state)!;
  }
  if ((await optional(repo, ['merge-base', '--is-ancestor', branch.hash, state.head])) === null)
    throw new AppError('branchNotMerged', 409);
  return actionArguments(action, state)!;
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
        args = actionArguments(action, state)!;
      } else if (action.type === 'commit') {
        if (!action.message.trim() || action.message.length > 10_000)
          throw new AppError('commitMessage');
        if (!state.staged) throw new AppError('stageRequired');
        if (state.files.some((f) => f.conflicted)) throw new AppError('resolveConflicts');
        args = actionArguments(action, state)!;
      } else if (action.type === 'fetch') {
        if (!state.remotes.length) throw new AppError('noRemote');
        args = actionArguments(action, state)!;
      } else {
        if (!state.upstream || state.detached) throw new AppError('noUpstream');
        if (action.type === 'pull' && state.changed) throw new AppError('dirtyPull');
        if (action.type === 'pull') args = actionArguments(action, state)!;
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
          args = actionArguments(action, { ...state, pushTarget: { remote, ref: merge } })!;
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
