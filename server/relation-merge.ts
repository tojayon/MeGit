import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { cardUsesWorktree, isCardRef } from '../shared/card-refs.js';
import { diffOptions, prepareMergeArguments } from '../shared/git-commands.js';
import type { RelationMergeRequest, RelationMergeResult, RelationMergeView, RepoState } from '../shared/types.js';
import { AppError } from './errors.js';
import { fetchLocalCommit, queueAction, readRepository, runGit } from './git.js';

type Context = {
  boardId: string;
  edgeId: string;
  source: string;
  target: string;
  dataDirectory: string;
  validate: () => Promise<void>;
};

type Session = {
  id: string;
  owner: string;
  sourceRef: string;
  sourceHead: string;
  targetHead: string;
};

const diffLimit = 48_000;
const commitLimit = 20;
const mergeMarker = (session: Session) => `MeGit merge ${session.id}`;
export const commitHashSchema = z.string().regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/);
export const relationSelectionSchema = z.strictObject({
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  sourceRepo: z.string().min(1).max(100),
  targetRepo: z.string().min(1).max(100),
  sourceRef: z.string().refine(isCardRef),
  targetRef: z.string().refine(isCardRef),
  sourceHead: commitHashSchema,
  targetHead: commitHashSchema,
});

function identifyReview<View extends Omit<Extract<RelationMergeView, { phase: 'review' }>, 'reviewKey'> |
  Omit<Extract<RelationMergeView, { phase: 'pending' }>, 'reviewKey'>>(view: View, ...commits: string[]) {
  const reviewKey = createHash('sha256').update(JSON.stringify([commits, view])).digest('hex');
  return { ...view, reviewKey };
}

function localGit(repo: string, args: string[], options: {
  alternating?: string;
  allowExitOne?: boolean;
  limit?: number;
} = {}) {
  return runGit(repo, args, false, options.allowExitOne, options.limit, false, undefined, true, options.alternating);
}

async function diff(repo: string, args: string[], alternating?: string) {
  const { stdout } = await localGit(repo, ['diff', ...diffOptions, ...args, '--'], {
    limit: diffLimit,
    alternating,
  });
  return { text: stdout.slice(0, diffLimit), truncated: stdout.length > diffLimit };
}

async function hashAt(repo: string, ref: string) {
  return (await localGit(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]))
    .stdout.trim().toLowerCase();
}

async function history(context: Context, request: RelationMergeRequest) {
  async function gitLayout(repo: string) {
    const { stdout } = await localGit(repo, ['rev-parse', '--is-shallow-repository', '--show-object-format', '--path-format=absolute', '--git-path', 'objects']);
    return stdout.trimEnd().split(/\r?\n/);
  }
  const [[sourceShallow, sourceFormat, objects], [targetShallow, targetFormat, targetObjects]] =
    await Promise.all([gitLayout(context.source), gitLayout(context.target)]);
  if (!objects || !targetObjects || sourceShallow !== 'false' || targetShallow !== 'false' ||
      sourceFormat !== targetFormat || objects.toLowerCase() === targetObjects.toLowerCase())
    throw new AppError('relationMergeHistory', 409);
  const alternating = JSON.stringify(objects);
  const { sourceHead, targetHead } = request;
  const { stdout } = await localGit(context.target, ['merge-base', '--all', targetHead, sourceHead], { alternating, allowExitOne: true });
  const bases = stdout.trim().split(/\s+/).filter(Boolean);
  if (!bases.length) throw new AppError('relationMergeHistory', 409);
  if (bases.includes(sourceHead)) throw new AppError('relationMergeIncluded', 409);
  return { alternating, bases };
}

async function review(context: Context, request: RelationMergeRequest, state: RepoState): Promise<RelationMergeResult> {
  const { alternating, bases } = await history(context, request);
  const { sourceHead, targetHead } = request;
  async function unique(from: string, to: string) {
    const range = `${from}..${to}`;
    const [count, entries] = await Promise.all([
      localGit(context.target, ['rev-list', '--count', range], { alternating }),
      localGit(context.target, ['log', '--no-show-signature', '--format=%H%x1f%s', '-z', `--max-count=${commitLimit}`, range], { alternating }),
    ]);
    return {
      total: Number(count.stdout.trim()),
      commits: entries.stdout.split('\0').filter(Boolean).map((entry) => {
        const split = entry.indexOf('\x1f');
        return { hash: entry.slice(0, split), subject: entry.slice(split + 1, split + 241) };
      }),
    };
  }
  const [source, target, changes] = await Promise.all([
    unique(targetHead, sourceHead),
    unique(sourceHead, targetHead),
    bases.length === 1 ? diff(context.target, [bases[0], sourceHead], alternating) : null,
  ]);
  return identifyReview({
    phase: 'review', sourceTotal: source.total, targetTotal: target.total,
    sourceCommits: source.commits, targetCommits: target.commits, diff: changes,
    blocked: state.operation ? 'branchOperation' : state.changed ? 'dirtyPull' : undefined,
  }, sourceHead, targetHead);
}

async function pending(repo: string, session: Session, state: RepoState) {
  const index = () => localGit(repo, ['diff', '--cached', '--raw', '--no-renames', '--no-abbrev', '-z', session.targetHead, '--']);
  const before = await index();
  const changes = await diff(repo, ['--cached', session.targetHead]);
  if (before.stdout !== (await index()).stdout) throw new AppError('relationMergeIndexChanged', 409);
  return identifyReview({
    phase: 'pending' as const,
    session: session.id,
    sourceRef: session.sourceRef,
    sourceHead: session.sourceHead,
    index: createHash('sha256').update(before.stdout).digest('hex'),
    conflicts: state.files.filter((file) => file.conflicted).map((file) => file.path),
    ready: !state.files.some((file) => file.conflicted || file.untracked || file.worktreeStatus !== '.'),
    diff: changes,
  }, session.sourceHead, session.targetHead);
}

export function localRelationMerge(context: Context, request: RelationMergeRequest): Promise<RelationMergeResult> {
  const { source, target, dataDirectory, boardId, edgeId, validate } = context;
  const owner = JSON.stringify([boardId, edgeId, source, target, request.source, request.target, request.sourceRepo, request.targetRepo, request.targetRef]);
  const directory = path.join(dataDirectory, 'relation-merges');
  const sessionFile = path.join(directory, `${createHash('sha256').update(target).digest('hex')}.json`);
  const validTarget = (state: RepoState, head: string) => {
    if (!cardUsesWorktree(request.targetRef, state) || state.head !== head)
      throw new AppError('relationActionChanged', 409);
  };
  async function verifyTips(state: RepoState) {
    validTarget(state, request.targetHead);
    const sourceHead = await hashAt(source, request.sourceRef).catch(() => null);
    if (sourceHead !== request.sourceHead) throw new AppError('relationActionChanged', 409);
  }
  async function requireClean() {
    await validate();
    const state = await readRepository(target, true, true);
    await verifyTips(state);
    if (state.operation) throw new AppError('branchOperation', 409);
    if (state.changed) throw new AppError('dirtyPull', 409);
  }
  async function ownedSession(state: RepoState) {
    if (state.operation !== 'merge') return;
    const session = await readFile(sessionFile, 'utf8').then((text) => JSON.parse(text) as Session).catch(() => null);
    if (!session || session.owner !== owner || session.targetHead !== state.head) return;
    const readMergeFile = async (name: string) => {
      const result = await localGit(target, ['rev-parse', '--path-format=absolute', '--git-path', name]);
      return readFile(result.stdout.trimEnd(), 'utf8').catch(() => null);
    };
    const [heads, message] = await Promise.all([readMergeFile('MERGE_HEAD'), readMergeFile('MERGE_MSG')]);
    if (heads?.trim() === session.sourceHead && message?.split(/\r?\n/, 1)[0] === mergeMarker(session)) return session;
  }
  return queueAction(target, async () => {
    await validate();
    const state = await readRepository(target, true, true);
    const active = await ownedSession(state);
    if (request.step === 'review') {
      if (active) {
        validTarget(state, active.targetHead);
        return pending(target, active, state);
      }
      await verifyTips(state);
      return review(context, request, state);
    }
    if (request.step === 'prepare') {
      await requireClean();
      await history(context, request);
      await fetchLocalCommit(source, target, request.sourceHead);
      await requireClean();
      const session: Session = { id: randomUUID(), owner, sourceRef: request.sourceRef, sourceHead: request.sourceHead, targetHead: request.targetHead };
      await mkdir(directory, { recursive: true });
      const temporary = `${sessionFile}.${session.id}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(session), { flag: 'wx' });
        await rename(temporary, sessionFile);
      } finally {
        await rm(temporary, { force: true });
      }
      try {
        await localGit(target, prepareMergeArguments(request.sourceHead, mergeMarker(session)));
      } catch (failure) {
        const latest = await readRepository(target, true, true);
        if (!(await ownedSession(latest)) || !latest.files.some((file) => file.conflicted)) throw failure;
        return pending(target, session, latest);
      }
      const latest = await readRepository(target, true, true);
      if (!(await ownedSession(latest))) throw new AppError('relationActionChanged', 409);
      return pending(target, session, latest);
    }
    if (!active || active.id !== request.session) throw new AppError('relationActionChanged', 409);
    validTarget(state, active.targetHead);
    if (request.step === 'commit') {
      const staged = await pending(target, active, state);
      if (staged.conflicts.length) throw new AppError('resolveConflicts', 409);
      if (!staged.ready) throw new AppError('relationMergeUnstaged', 409);
      if (staged.index !== request.index) throw new AppError('relationMergeIndexChanged', 409);
      await localGit(target, ['commit', '-m', request.message]);
    } else {
      await localGit(target, ['-c', 'submodule.recurse=false', '-c', 'rerere.enabled=false', 'merge', '--abort']);
    }
    await rm(sessionFile, { force: true });
    return { phase: request.step === 'commit' ? 'committed' : 'aborted', state: await readRepository(target, true, true) };
  });
}
