import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  BranchAction,
  BranchExpectation,
  ChangedFile,
  Commit,
  DiffQuery,
  DiffResult,
  GitAction,
  IntegrationState,
  RepoState,
  RemoteAction,
  RelationAction,
} from '../shared/types.js';
import { AppError, safeMessage } from './errors.js';
import { isBranchName, isSafeRef } from '../shared/refs.js';
import { gitProxyRoute, proxyEnvironment, proxyFailure } from './network-proxy.js';
import { cardUsesWorktree, relationUpstreamMatches } from '../shared/card-refs.js';
import {
  actionArguments,
  commitDiffArguments,
  fileDiffArguments,
  gitExecutionOptions,
  historyArguments,
  httpRemoteHasCredentials,
  statusArguments,
} from '../shared/git-commands.js';

const execute = promisify(execFile);
const MAX_DIFF = 240_000;
const queues = new Map<string, Promise<unknown>>();
type GitProxy = { address: string; routes: [remote: string, address: string][]; url?: string };

async function run(
  repo: string,
  args: string[],
  network = false,
  allowExitOne = false,
  outputLimit?: number,
  remoteProbe = false,
  proxy?: GitProxy,
  localOnly = false,
) {
  const proxyArgs = proxy
    ? [
        '-c',
        `http.proxy=${proxy.address}`,
        '-c',
        'http.followRedirects=false',
        ...(proxy.url ? ['-c', `http.${proxy.url}.proxy=${proxy.address}`] : []),
        ...proxy.routes.flatMap(([name, address]) => ['-c', `remote.${name}.proxy=${address}`]),
      ]
    : [];
  const probeArgs = remoteProbe ? ['-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=10'] : [];
  try {
    const result = await execute(
      'git',
      [...gitExecutionOptions, ...proxyArgs, ...probeArgs, ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        windowsHide: true,
        timeout: remoteProbe ? 15_000 : network ? 120_000 : 20_000,
        maxBuffer: outputLimit ? outputLimit * 4 + 4096 : 8 * 1024 * 1024,
        env: {
          ...(proxy ? proxyEnvironment(proxy.address) : process.env),
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_OPTIONAL_LOCKS: '0',
          LC_ALL: 'C',
          LANG: 'C',
          ...(proxy || remoteProbe ? { GIT_ALLOW_PROTOCOL: 'file:git:http:https:ssh' } : {}),
          ...(localOnly ? { GIT_ALLOW_PROTOCOL: 'file' } : {}),
          ...(remoteProbe
            ? {
                GIT_ASKPASS: '',
                SSH_ASKPASS_REQUIRE: 'never',
              }
            : {}),
        },
      },
    );
    return outputLimit ? { ...result, stdout: result.stdout.slice(0, outputLimit + 1) } : result;
  } catch (error) {
    const result = error as Error & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      code?: number | string;
    };
    if (
      outputLimit &&
      result.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' &&
      result.stdout &&
      result.stdout.length > outputLimit
    )
      return { stdout: result.stdout.slice(0, outputLimit + 1), stderr: '' };
    if (result.code === 'ENOENT') throw new AppError('gitMissing');
    if (result.killed) throw new AppError(proxy?.address ? 'proxyTimeout' : 'gitTimeout', 504);
    const message = result.stderr?.trim() || safeMessage(error);
    const proxyError = proxy?.address && proxyFailure(message);
    if (proxyError) throw new AppError(proxyError, 502);
    if (allowExitOne && result.code === 1)
      return { stdout: result.stdout || '', stderr: result.stderr || '', failed: true };
    if (args[0] === 'fetch' && /fatal: couldn't find remote ref refs\/heads\//.test(message))
      throw new AppError('remoteRefMissing', 422, safeMessage(new Error(message)));
    throw new AppError('gitFailed', 422, safeMessage(new Error(message)));
  }
}

export { run as runGit };

export function routeGitAddress(
  repo: string,
  name: string | undefined,
  address: string,
  proxy?: string,
) {
  if (!proxy) return undefined;
  const route = gitProxyRoute(repo, address, proxy);
  return {
    address: route,
    routes: name ? [[name, route]] : [],
    ...(!name && /^https?:\/\//i.test(address) ? { url: address } : {}),
  } satisfies GitProxy;
}

async function readProxyRoutes(
  repo: string,
  names: string[],
  proxy?: string,
  push = false,
): Promise<GitProxy | undefined> {
  if (!proxy) return;
  const routes = await Promise.all(
    names.map(async (name): Promise<[string, string]> => {
      const { stdout } = await run(repo, [
        'remote',
        'get-url',
        ...(push ? ['--push'] : []),
        '--',
        name,
      ]);
      return [name, gitProxyRoute(repo, stdout.trim(), proxy)];
    }),
  );
  return { address: routes.some(([, address]) => !!address) ? proxy : '', routes };
}

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

export async function readRepository(repo: string, expandUntracked = false): Promise<RepoState> {
  const [raw, refResult, remoteResult, fetchFile] = await Promise.all([
    run(
      repo,
      expandUntracked
        ? statusArguments.map((arg) =>
            arg === '--untracked-files=normal' ? '--untracked-files=all' : arg,
          )
        : statusArguments,
    ),
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
  let upstreamHead: string | null = null;
  let upstreamRef: string | null = null;
  let trackingConfigured = false;
  if (branch) {
    const [remote, ref, tip, fullUpstream] = await Promise.all([
      optional(repo, ['config', '--get', `branch.${branch}.remote`]),
      optional(repo, ['config', '--get-all', `branch.${branch}.merge`]),
      upstream ? optional(repo, ['rev-parse', '--verify', '@{upstream}^{commit}']) : null,
      upstream ? optional(repo, ['rev-parse', '--symbolic-full-name', '@{upstream}']) : null,
    ]);
    trackingConfigured = !!(remote || ref);
    if (
      upstream &&
      remote &&
      remoteNames.includes(remote) &&
      !remote.startsWith('-') &&
      remote !== '.' &&
      ref?.startsWith('refs/heads/') &&
      isBranchName(ref.slice('refs/heads/'.length)) &&
      tip
    ) {
      pushTarget = { remote, ref };
      upstreamHead = tip;
      upstreamRef = fullUpstream;
    }
  }
  return {
    branch,
    head:
      headers['branch.oid'] && headers['branch.oid'] !== '(initial)' ? headers['branch.oid'] : null,
    detached: headers['branch.head'] === '(detached)',
    upstream,
    upstreamRef,
    trackingConfigured,
    pushTarget,
    upstreamHead,
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

export async function getHistory(repo: string, skip = 0, ref?: string): Promise<Commit[]> {
  const head = await commitHash(repo, ref ?? 'HEAD');
  if (ref && !head) throw new AppError('invalidRef');
  if (!head) return [];
  const result = await run(repo, historyArguments(skip, ref ? head : undefined));
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
  const base: Pick<IntegrationState, 'sourceHead' | 'targetHead' | 'pending' | 'divergence'> = {
    sourceHead,
    targetHead,
    pending: null,
  };
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
  if (source === target && sourceRef !== targetRef) {
    if (sourceHead === targetHead) base.divergence = { targetAhead: 0, targetBehind: 0 };
    else if (
      (await optional(target, ['rev-parse', '--is-shallow-repository'])) === 'false' &&
      (await optional(target, ['merge-base', sourceHead, targetHead]))
    ) {
      const counts = (
        await run(target, ['rev-list', '--left-right', '--count', `${sourceHead}...${targetHead}`])
      ).stdout
        .trim()
        .split(/\s+/)
        .map(Number);
      base.divergence = { targetAhead: counts[1], targetBehind: counts[0] };
    }
  }
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

export async function performAction(
  repo: string,
  action: GitAction,
  worktreeRef?: string,
  proxy?: string,
  guard?: { before: () => Promise<void>; after?: () => Promise<void>; relation?: RelationAction },
): Promise<string> {
  return queueAction(repo, async () => {
      await guard?.before();
      const state = await readRepository(repo, !!guard);
      if ((action.type === 'pull' || action.type === 'push') && action.expected) {
        const { branch, head, remote, ref, upstreamHead } = action.expected;
        if (state.detached || state.branch !== branch || state.head !== head)
          throw new AppError('branchStateChanged', 409);
        if (state.pushTarget?.remote !== remote || state.pushTarget.ref !== ref || state.upstreamHead !== upstreamHead)
          throw new AppError('syncTargetChanged', 409);
      }
      if (guard?.relation) {
        const relation = guard.relation;
        const fromLocal = relation.sourceRef.startsWith('refs/heads/');
        const localRef = fromLocal ? relation.sourceRef : relation.targetRef;
        const remoteRef = fromLocal ? relation.targetRef : relation.sourceRef;
        if (!relationUpstreamMatches(localRef, remoteRef, state) ||
          state.head !== (fromLocal ? relation.sourceHead : relation.targetHead) ||
          state.upstreamHead !== (fromLocal ? relation.targetHead : relation.sourceHead))
          throw new AppError('relationActionChanged', 409);
        if (state.ahead && state.behind) throw new AppError('relationNonFastForward', 409);
        if (action.type === 'push' && state.pushTarget) {
          const remote = state.pushTarget.remote;
          const [readUrl, pushUrl] = await Promise.all([
            run(repo, ['remote', 'get-url', '--all', '--', remote]),
            run(repo, ['remote', 'get-url', '--push', '--all', '--', remote]),
          ]);
          if (readUrl.stdout.trim() !== pushUrl.stdout.trim())
            throw new AppError('relationRemoteMismatch', 409);
        }
      }
      if (worktreeRef && !cardUsesWorktree(worktreeRef, state))
        throw new AppError('branchStateChanged', 409);
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
      } else if (
        action.type === 'addRemote' ||
        action.type === 'publishBranch' ||
        action.type === 'setTracking'
      ) {
        args = await remoteActionArguments(repo, state, action, proxy);
      } else {
        if (state.detached || !state.trackingConfigured) throw new AppError('noUpstream');
        if (!state.pushTarget) throw new AppError('upstreamUnavailable', 409);
        if (state.operation) throw new AppError('branchOperation', 409);
        if (action.type === 'pull') {
          if (state.changed) throw new AppError('dirtyPull');
          args = actionArguments(action, state)!;
        } else {
          const { remote, ref } = state.pushTarget;
          const live = await remoteBranchTip(repo, remote, ref, proxy);
          if (!state.head || !live || live !== state.upstreamHead)
            throw new AppError('pushNeedsFetch', 409);
          const check = await run(
            repo,
            ['merge-base', '--is-ancestor', live, state.head],
            false,
            true,
          );
          if ('failed' in check) throw new AppError('pushNonFastForward', 409);
          args = actionArguments(action, state)!;
        }
      }
      const pushing = action.type === 'publishBranch' || action.type === 'push';
      const targets =
        action.type === 'fetch'
          ? state.remotes
          : action.type === 'publishBranch'
            ? [action.remote]
            : (action.type === 'pull' || action.type === 'push') && state.pushTarget
              ? [state.pushTarget.remote]
              : [];
      const options = targets.length
        ? await readProxyRoutes(repo, targets, proxy, pushing)
        : undefined;
      const result = await run(
        repo,
        args,
        pushing || ['fetch', 'pull'].includes(action.type),
        pushing,
        undefined,
        false,
        options,
      );
      if (pushing) {
        const outcome = result.stdout.split(/\r?\n/);
        if (outcome.some((line) => line.startsWith('!\t') && line.endsWith('(stale info)')))
          throw new AppError(
            action.type === 'publishBranch' ? 'remoteBranchExists' : 'pushNeedsFetch',
            409,
          );
        if ('failed' in result)
          throw new AppError(
            'gitFailed',
            422,
            safeMessage(new Error((result.stderr + result.stdout).trim())),
          );
        if (action.type === 'publishBranch' && !outcome.some((line) => line.startsWith('*\t')))
          throw new AppError('remoteBranchExists', 409);
      }
      await guard?.after?.();
      return safeMessage(new Error((result.stdout + result.stderr).trim() || 'OK'));
  });
}

async function queueAction<T>(repo: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(repo) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  queues.set(repo, next);
  try {
    return await next;
  } finally {
    if (queues.get(repo) === next) queues.delete(repo);
  }
}

export function integrateLocalRelation(
  source: string,
  target: string,
  action: RelationAction,
  validate: () => Promise<void>,
) {
  return queueAction(target, async () => {
    const verify = async () => {
      await validate();
      const [sourceHead, state] = await Promise.all([
        commitHash(source, action.sourceRef),
        readRepository(target),
      ]);
      if (sourceHead !== action.sourceHead || state.head !== action.targetHead ||
        !cardUsesWorktree(action.targetRef, state))
        throw new AppError('relationActionChanged', 409);
      if (state.operation) throw new AppError('branchOperation', 409);
      if (state.changed) throw new AppError('dirtyPull', 409);
    };
    await verify();
    const address = (await run(target, ['ls-remote', '--get-url', '--', source])).stdout.trim();
    if (address !== source) throw new AppError('relationActionChanged', 409);
    await run(target, ['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head',
      '--no-auto-maintenance', '--no-write-commit-graph', '--refmap=', '--', source, action.sourceHead],
    true, false, undefined, false, undefined, true);
    const ancestor = await run(target, ['merge-base', '--is-ancestor', action.targetHead, action.sourceHead], false, true);
    if ('failed' in ancestor) throw new AppError('relationNonFastForward', 409);
    await verify();
    await run(target, ['-c', 'submodule.recurse=false', 'merge', '--ff-only', '--no-squash',
      '--no-autostash', '--no-overwrite-ignore', '--', action.sourceHead]);
  });
}

function requireCurrentBranch(state: RepoState, expected: BranchExpectation) {
  if (
    state.branch !== expected.branch ||
    state.head !== expected.head ||
    state.detached !== expected.detached ||
    state.detached ||
    !state.branch
  )
    throw new AppError('branchStateChanged', 409);
  if (state.operation) throw new AppError('branchOperation', 409);
  if (!state.head) throw new AppError('branchNoCommits', 409);
}

async function remoteBranchTip(repo: string, remote: string, ref: string, proxy?: string) {
  const destinations = (
    await run(repo, ['remote', 'get-url', '--push', '--all', '--', remote])
  ).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (destinations.length !== 1) throw new AppError('multiplePushDestinations', 409);
  const options = routeGitAddress(repo, undefined, destinations[0], proxy);
  const { stdout } = await run(
    repo,
    ['ls-remote', '--refs', '--', destinations[0], ref],
    true,
    false,
    undefined,
    !!proxy,
    options,
  );
  return (
    stdout
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .find(([, name]) => name === ref)?.[0] ?? null
  );
}

async function remoteActionArguments(
  repo: string,
  state: RepoState,
  action: RemoteAction,
  proxy?: string,
) {
  if (action.type === 'addRemote') {
    if (!isBranchName(action.name) || action.name.includes('/')) throw new AppError('remoteName');
    if (state.remotes.includes(action.name)) throw new AppError('remoteExists', 409);
    const destination = action.destination;
    if (httpRemoteHasCredentials(destination)) throw new AppError('remoteDestinationCredentials');
    if (
      destination !== destination.trim() ||
      /\p{Cc}/u.test(destination) ||
      !(
        /^(?:https?|ssh|git|file):\/\/[^\s]/i.test(destination) ||
        (path.isAbsolute(destination) && !destination.startsWith('//')) ||
        /^(?:[\w.-]+@)?[\w.-]+:(?![:/])\S/u.test(destination)
      )
    )
      throw new AppError('remoteDestination');
  } else {
    requireCurrentBranch(state, action.expected);
    if (action.type === 'publishBranch') {
      if (state.trackingConfigured) throw new AppError('upstreamAlreadySet', 409);
      if (
        !state.remotes.includes(action.remote) ||
        action.remote.startsWith('-') ||
        action.remote === '.'
      )
        throw new AppError('remoteNotConfigured', 409);
      const ref = `refs/heads/${action.name}`;
      if (!isBranchName(action.name) || (await optional(repo, ['check-ref-format', ref])) === null)
        throw new AppError('branchName');
      if (await remoteBranchTip(repo, action.remote, ref, proxy))
        throw new AppError('remoteBranchExists', 409);
    } else {
      if (state.pushTarget) throw new AppError('upstreamAlreadySet', 409);
      const target = state.branches.find(
        (branch) => branch.remote && `refs/remotes/${branch.name}` === action.targetRef,
      );
      if (!target || target.hash !== action.targetHash)
        throw new AppError('branchTargetChanged', 409);
    }
  }
  return actionArguments(action, state)!;
}
