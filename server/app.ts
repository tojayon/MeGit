import express, { type ErrorRequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { WorkspaceStore } from './workspace.js';
import { AppError, errorInfo, safeMessage } from './errors.js';
import {
  resolveRepository,
  readRepository,
  getHistory,
  getDiff,
  inspectIntegration,
  performAction,
  integrateLocalRelation,
  currentBranchRef,
} from './git.js';
import type { GitAction, RelationMergeRequest, RepoState, Snapshot } from '../shared/types.js';
import { listRepositoryImages, readRepositoryImage } from './repository-images.js';
import { readBranchTree, compareBranches } from './branch-tree.js';
import { readIntegrationHistory } from './integration-history.js';
import { isCardRef, relationActionRef, relationRefs } from '../shared/card-refs.js';
import { pickLocal } from './local-picker.js';
import { realpath } from 'node:fs/promises';
import { aiRouter } from './ai.js';
import { readCommitContext } from './ai-commit.js';
import { checkRemoteRead, githubLoginAvailable, loginRemoteGitHub } from './remote-access.js';
import { NetworkSettings, testNetworkProxy, withProxyFetch } from './network-proxy.js';
import { LocalServices } from './local-service.js';
import { inspectRepositoryEdit, listRepositoryFiles, previewRepositoryEdit, saveRepositoryEdit } from './repository-files.js';
import { repositoryEditRequestSchema, repositoryEditSaveSchema, repositoryEditTargetSchema } from '../shared/repository-files.js';
import { commitHashSchema as hashSchema, localRelationMerge, relationSelectionSchema } from './relation-merge.js';

const relationActionSchema = relationSelectionSchema.extend({ type: z.enum(['pull', 'push', 'integrate']) });
const relationMergeSchema = z.discriminatedUnion('step', [
  relationSelectionSchema.extend({ step: z.literal('review') }),
  relationSelectionSchema.extend({ step: z.literal('prepare') }),
  relationSelectionSchema.extend({ step: z.literal('abort'), session: z.uuid() }),
  relationSelectionSchema.extend({
    step: z.literal('commit'), session: z.uuid(), index: z.string().regex(/^[a-f0-9]{64}$/),
    message: z.string().trim().min(1).max(10000),
  }),
]);
const branchExpectationSchema = z.strictObject({
  branch: z.string().max(240),
  head: hashSchema.nullable(),
  detached: z.boolean(),
});
const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stage'),
    paths: z.array(z.string().min(1).max(4000)).min(1).max(2000),
  }),
  z.object({
    type: z.literal('unstage'),
    paths: z.array(z.string().min(1).max(4000)).min(1).max(2000),
  }),
  z.object({ type: z.literal('commit'), message: z.string().trim().min(1).max(10000) }),
  z.strictObject({ type: z.literal('fetch') }),
  z.strictObject({ type: z.literal('fetchRemote'), remote: z.string().min(1).max(240) }),
  z.strictObject({
    type: z.enum(['pull', 'push']),
    expected: z.strictObject({
      branch: z.string().min(1),
      head: hashSchema,
      remote: z.string().min(1),
      ref: z.string().min(1),
      upstreamHead: hashSchema,
    }),
  }),
  z.strictObject({
    type: z.literal('addRemote'),
    name: z.string().min(1).max(240),
    destination: z.string().min(1).max(4000),
  }),
  z.strictObject({
    type: z.literal('publishBranch'),
    remote: z.string().min(1).max(240),
    name: z.string().min(1).max(240),
    expected: branchExpectationSchema,
  }),
  z.strictObject({
    type: z.literal('setTracking'),
    targetRef: z.string().min(1).max(520),
    targetHash: hashSchema,
    expected: branchExpectationSchema,
  }),
  z.strictObject({
    type: z.literal('createBranch'),
    name: z.string().min(1).max(240),
    startPoint: z.string().min(1).max(260),
    startHash: hashSchema,
    checkout: z.boolean(),
    track: z.boolean(),
    expected: branchExpectationSchema,
  }),
  z.strictObject({
    type: z.enum(['switchBranch', 'deleteBranch']),
    name: z.string().min(1).max(240),
    targetHash: hashSchema,
    expected: branchExpectationSchema,
  }),
]);

function failedState(error: unknown): RepoState {
  return {
    branch: '',
    head: null,
    detached: false,
    upstream: null,
    ahead: null,
    behind: null,
    changed: 0,
    staged: 0,
    files: [],
    branches: [],
    remotes: [],
    fetchedAt: null,
    checkedAt: new Date().toISOString(),
    error: safeMessage(error),
    errorInfo: errorInfo(error),
  };
}

export function createApp(options: { dataDirectory: string }) {
  const app = express();
  const store = new WorkspaceStore(options.dataDirectory);
  const network = new NetworkSettings(options.dataDirectory);
  const services = new LocalServices(options.dataDirectory);
  app.locals.closeLocalServices = () => services.close();
  const token = randomBytes(32).toString('hex');
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.get('host');
    const allowed = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    if (
      !host ||
      !allowed.includes(host) ||
      (req.get('origin') && req.get('origin') !== `http://${host}`) ||
      req.get('sec-fetch-site') === 'cross-site'
    ) {
      res.status(403).json({
        ...errorInfo(new AppError('localOnly')),
        error: new AppError('localOnly').message,
      });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/session', (_req, res) => res.json({ token, version: '0.1.0' }));
  app.use('/api', (req, res, next) => {
    if (req.get('x-megit-token') !== token) {
      res.status(403).json({
        ...errorInfo(new AppError('sessionExpired')),
        error: new AppError('sessionExpired').message,
      });
      return;
    }
    next();
  });
  app.use('/api', express.json({ limit: '1mb' }));

  async function registeredRepository(id: string) {
    const workspace = await store.read();
    const repo = workspace.repositories.find((r) => r.id === id);
    if (!repo) throw new AppError('repositoryMissing', 404);
    return repo;
  }

  async function repository(id: string) {
    const repo = await registeredRepository(id);
    const normalized = await resolveRepository(repo.path);
    if (normalized.toLowerCase() !== repo.path.toLowerCase())
      throw new AppError('repositoryMoved', 409);
    return repo;
  }

  async function editableRepository(id: string) {
    const repo = await repository(id);
    if (repo.archived) throw new AppError('repositoryMissing', 404);
    return repo;
  }

  app.get('/api/repositories/:id/files', async (req, res) => {
    const repo = await editableRepository(req.params.id);
    res.json(await listRepositoryFiles(repo.path));
  });
  app.post('/api/repositories/:id/files/read', async (req, res) => {
    const target = repositoryEditTargetSchema.safeParse(req.body);
    if (!target.success) throw new AppError('repositoryEditPath');
    const repo = await editableRepository(req.params.id);
    res.json(await inspectRepositoryEdit(repo.path, target.data));
  });
  app.post('/api/repositories/:id/files/preview', async (req, res) => {
    const input = repositoryEditRequestSchema.safeParse(req.body);
    if (!input.success) throw new AppError('repositoryEditPath');
    const repo = await editableRepository(req.params.id);
    const { files, approval } = await previewRepositoryEdit(repo.path, input.data);
    res.json({ files, approval });
  });
  app.put('/api/repositories/:id/files', async (req, res) => {
    const input = repositoryEditSaveSchema.safeParse(req.body);
    if (!input.success) throw new AppError('repositoryEditPath');
    const id = req.params.id;
    const repo = await editableRepository(id);
    res.json(await saveRepositoryEdit(repo.path, input.data, async () => {
      if ((await editableRepository(id)).path !== repo.path) throw new AppError('repositoryEditChanged', 409);
    }));
  });

  app.use(
    '/api/ai',
    aiRouter(
      options.dataDirectory,
      async (id) => readRepository((await repository(id)).path),
      async (id) => readCommitContext((await repository(id)).path),
      async () => withProxyFetch(await network.proxy()),
      {
        repository,
        services,
        mergeReview: async (boardId, edgeId, selection) => {
          const view = await runRelationMerge(boardId, edgeId, { ...selection, step: 'review' });
          if (!('reviewKey' in view)) throw new AppError('aiMergeReviewChanged', 409);
          return view;
        },
        proxy: () => network.proxy(),
        board: async (id) => {
          const workspace = await store.read();
          const board = workspace.boards.find((item) => item.id === id);
          if (!board) throw new AppError('assistantBoardInvalid');
          return {
            board,
            repositoryNames: Object.fromEntries(
              workspace.repositories.map((repo) => [repo.id, repo.name]),
            ),
          };
        },
      },
    ),
  );
  app.get('/api/workspace', async (_req, res) => res.json(await store.read()));
  app.get('/api/local-services', async (req, res) => {
    const workspace = await store.read();
    if (req.query.boardId === undefined) {
      res.json(services.activeServices(workspace.repositories));
      return;
    }
    const board = workspace.boards.find(({ id }) => id === req.query.boardId);
    if (!board) throw new AppError('boardMissing', 404);
    const heads = new Set(board.nodes.filter((node) => !node.ref).map((node) => node.repoId));
    res.json(
      await services.cardStates(workspace.repositories.filter((repo) => heads.has(repo.id))),
    );
  });
  app.get('/api/repositories/:id/local-service', async (req, res) => {
    res.json(await services.state((await registeredRepository(req.params.id)).path));
  });
  app.put('/api/repositories/:id/local-service', async (req, res) => {
    res.json(await services.save((await registeredRepository(req.params.id)).path, req.body));
  });
  app.post('/api/repositories/:id/local-service', async (req, res) => {
    res.json(await services.action((await registeredRepository(req.params.id)).path, req.body));
  });
  app.get('/api/network/settings', async (_req, res) => res.json(await network.read()));
  app.put('/api/network/settings', async (req, res) => res.json(await network.save(req.body)));
  app.post('/api/network/test', async (req, res) => {
    const result = z
      .strictObject({ address: z.string().trim().min(1).max(2048) })
      .safeParse(req.body);
    if (!result.success) throw new AppError('proxyInvalid');
    res.json(await testNetworkProxy(result.data.address));
  });
  app.post('/api/local-picker/folder', async (_req, res) =>
    res.json({ path: await pickLocal('folder') }),
  );
  app.post('/api/repositories/:id/pick-image', async (req, res) => {
    const repo = await repository(req.params.id);
    const selected = await pickLocal('image', repo.path);
    if (!selected) return res.json({ path: null });
    const resolved = await realpath(selected).catch(() => {
      throw new AppError('repositoryImageMissing', 404);
    });
    const relative = path.relative(repo.path, resolved).replaceAll('\\', '/');
    await readRepositoryImage(repo.path, relative);
    return res.json({ path: relative });
  });
  app.put('/api/workspace', async (req, res) => res.json(await store.save(req.body)));
  app.post('/api/repositories/inspect', async (req, res) => {
    const parsed = z.object({ path: z.string().min(1).max(4000) }).safeParse(req.body);
    if (!parsed.success) throw new AppError('pathRequired');
    const root = await resolveRepository(parsed.data.path);
    res.json({ path: root, name: path.basename(root), state: await readRepository(root) });
  });

  app.get('/api/snapshot', async (req, res) => {
    const workspace = await store.read();
    const board = workspace.boards.find(
      (b) => b.id === (req.query.boardId || workspace.activeBoardId),
    );
    if (!board) throw new AppError('boardMissing', 404);
    const repositoryFields: NonNullable<Snapshot['repositoryFields']> = {};
    const result: Snapshot = {
      repositories: {},
      repositoryFields,
      relations: {},
      checkedAt: new Date().toISOString(),
    };
    const repos = workspace.repositories.filter((r) => board.nodes.some((n) => n.repoId === r.id));
    for (let i = 0; i < repos.length; i += 4) {
      await Promise.all(
        repos.slice(i, i + 4).map(async (repo) => {
          try {
            await repository(repo.id);
            result.repositories[repo.id] = await readRepository(repo.path);
            if (repo.shortcut && !repo.archived) {
              try {
                const { value } = await inspectRepositoryEdit(repo.path, repo.shortcut.target);
                repositoryFields[repo.id] = { value: value.length > 120 ? value.slice(0, 119) + '…' : value };
              } catch (error) {
                repositoryFields[repo.id] = { error: errorInfo(error) };
              }
            }
          } catch (error) {
            result.repositories[repo.id] = failedState(error);
          }
        }),
      );
    }
    for (const edge of board.edges.filter((e) => e.kind === 'integration')) {
      const source = repos.find(
        (r) => r.id === board.nodes.find((n) => n.id === edge.source)?.repoId,
      );
      const target = repos.find(
        (r) => r.id === board.nodes.find((n) => n.id === edge.target)?.repoId,
      );
      if (!source || !target) continue;
      if (result.repositories[source.id]?.error || result.repositories[target.id]?.error) {
        result.relations[edge.id] = {
          state: 'unknown',
          sourceHead: null,
          targetHead: null,
          pending: null,
          message: '仓库暂时不可用。',
          messageCode: 'unavailable',
        };
        continue;
      }
      try {
        const { sourceRef, targetRef } = relationRefs(edge, board.nodes);
        result.relations[edge.id] = await inspectIntegration(
          source.path,
          target.path,
          sourceRef,
          targetRef,
        );
      } catch (error) {
        result.relations[edge.id] = {
          state: 'unknown',
          sourceHead: null,
          targetHead: null,
          pending: null,
          message: safeMessage(error),
          errorInfo: errorInfo(error),
        };
      }
    }
    res.json(result);
  });

  app.get('/api/boards/:boardId/relations/:edgeId/history', async (req, res) => {
    const query = z
      .strictObject({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        sourceHash: hashSchema.optional(),
        targetHash: hashSchema.optional(),
      })
      .safeParse(req.query);
    if (
      !query.success ||
      (query.data.offset > 0 && (!query.data.sourceHash || !query.data.targetHash))
    )
      throw new AppError('invalidRef');
    const workspace = await store.read();
    const board = workspace.boards.find((item) => item.id === req.params.boardId);
    if (!board) throw new AppError('boardMissing', 404);
    const edge = board.edges.find(
      (item) => item.id === req.params.edgeId && item.kind === 'integration',
    );
    if (!edge) throw new AppError('invalidEdge', 404);
    const sourceId = board.nodes.find((node) => node.id === edge.source)?.repoId;
    const targetId = board.nodes.find((node) => node.id === edge.target)?.repoId;
    if (!sourceId || !targetId) throw new AppError('invalidEdge');
    const [source, target] = await Promise.all([repository(sourceId), repository(targetId)]);
    const { sourceRef, targetRef } = relationRefs(edge, board.nodes);
    res.json(
      await readIntegrationHistory(source.path, target.path, sourceRef, targetRef, query.data),
    );
  });
  app.post('/api/boards/:boardId/relations/:edgeId/action', async (req, res) => {
    const parsed = relationActionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('invalidAction');
    const action = parsed.data;
    const { boardId, edgeId } = req.params;
    const local = action.type === 'integrate';
    const bothLocal = [action.sourceRef, action.targetRef].every((ref) => ref.startsWith('refs/heads/'));
    if (local !== (action.sourceRepo !== action.targetRepo && bothLocal) ||
      (!local && (action.sourceRepo !== action.targetRepo ||
        action.sourceRef.startsWith('refs/heads/') === action.targetRef.startsWith('refs/heads/'))))
      throw new AppError('relationActionChanged', 409);
    async function selection() {
      const workspace = await store.read();
      const board = workspace.boards.find((item) => item.id === boardId);
      const edge = board?.edges.find((item) => item.id === edgeId && item.kind === 'integration');
      const source = board?.nodes.find((item) => item.id === edge?.source);
      const target = board?.nodes.find((item) => item.id === edge?.target);
      if (!board || !edge || source?.id !== action.source || target?.id !== action.target ||
        source.repoId !== action.sourceRepo || target.repoId !== action.targetRepo ||
        (local && !edge.localIntegration)) throw new AppError('relationActionChanged', 409);
      const refs = relationRefs(edge, board.nodes);
      const sourceRepo = await repository(source.repoId);
      const targetRepo = local ? await repository(target.repoId) : sourceRepo;
      const [sourceState, targetState] = await Promise.all([
        refs.sourceRef === 'HEAD' ? readRepository(sourceRepo.path) : undefined,
        refs.targetRef === 'HEAD' ? readRepository(targetRepo.path) : undefined,
      ]);
      if (relationActionRef(refs.sourceRef, sourceState) !== action.sourceRef ||
        relationActionRef(refs.targetRef, targetState) !== action.targetRef ||
        (refs.sourceRef === 'HEAD' && sourceState?.head !== action.sourceHead) ||
        (refs.targetRef === 'HEAD' && targetState?.head !== action.targetHead))
        throw new AppError('relationActionChanged', 409);
      return [sourceRepo.path, targetRepo.path] as const;
    }
    const [sourcePath, targetPath] = await selection();
    const validate = async () => {
      const [source, target] = await selection();
      if (source !== sourcePath || target !== targetPath) throw new AppError('relationActionChanged', 409);
    };
    if (action.type === 'integrate') {
      await integrateLocalRelation(sourcePath, targetPath, action, validate);
    } else {
      await performAction(sourcePath, { type: action.type }, undefined, await network.proxy(), {
        before: validate,
        relation: action,
      });
    }
    res.json({ state: await readRepository(targetPath) });
  });
  async function runRelationMerge(boardId: string, edgeId: string, request: RelationMergeRequest) {
    const selection = {
      ...request,
      sourceHead: request.sourceHead.toLowerCase(),
      targetHead: request.targetHead.toLowerCase(),
    };
    if (selection.sourceRepo === selection.targetRepo ||
      ![selection.sourceRef, selection.targetRef].every((ref) => ref.startsWith('refs/heads/')))
      throw new AppError('relationActionChanged', 409);
    async function resolveSelection() {
      const workspace = await store.read();
      const board = workspace.boards.find((item) => item.id === boardId);
      const edge = board?.edges.find((item) => item.id === edgeId && item.kind === 'integration');
      const source = board?.nodes.find((item) => item.id === edge?.source);
      const target = board?.nodes.find((item) => item.id === edge?.target);
      if (!board || !edge?.localMerge || source?.id !== selection.source || target?.id !== selection.target ||
        source.repoId !== selection.sourceRepo || target.repoId !== selection.targetRepo)
        throw new AppError('relationActionChanged', 409);
      const [sourceRepo, targetRepo] = await Promise.all([repository(source.repoId), repository(target.repoId)]);
      if (sourceRepo.path === targetRepo.path) throw new AppError('relationActionChanged', 409);
      const refs = relationRefs(edge, board.nodes);
      const [sourceRef, targetRef] = await Promise.all([
        refs.sourceRef === 'HEAD' ? currentBranchRef(sourceRepo.path) : relationActionRef(refs.sourceRef),
        refs.targetRef === 'HEAD' ? currentBranchRef(targetRepo.path) : relationActionRef(refs.targetRef),
      ]);
      if (sourceRef !== selection.sourceRef || targetRef !== selection.targetRef)
        throw new AppError('relationActionChanged', 409);
      return [sourceRepo.path, targetRepo.path] as const;
    }
    const [source, target] = await resolveSelection();
    return localRelationMerge({
      boardId, edgeId, source, target, dataDirectory: options.dataDirectory,
      validate: async () => {
        const [latestSource, latestTarget] = await resolveSelection();
        if (latestSource !== source || latestTarget !== target) throw new AppError('relationActionChanged', 409);
      },
    }, selection);
  }
  app.post('/api/boards/:boardId/relations/:edgeId/merge', async (req, res) => {
    const parsed = relationMergeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('invalidAction');
    res.json(await runRelationMerge(req.params.boardId, req.params.edgeId, parsed.data));
  });
  app.get('/api/repositories/:id/images', async (req, res) => {
    const repo = await repository(req.params.id);
    const query = z
      .object({
        directory: z.string().max(4000).default(''),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .safeParse(req.query);
    if (!query.success) throw new AppError('invalidPath');
    res.json(await listRepositoryImages(repo.path, query.data.directory, query.data.offset));
  });
  app.get('/api/repositories/:id/image', async (req, res) => {
    const repo = await repository(req.params.id);
    const query = z.object({ path: z.string().min(1).max(4000) }).safeParse(req.query);
    if (!query.success) throw new AppError('invalidPath');
    res.json(await readRepositoryImage(repo.path, query.data.path));
  });
  app.get('/api/repositories/:id/branch-tree', async (req, res) => {
    const repo = await repository(req.params.id);
    const query = z
      .strictObject({
        base: z.string().min(1).max(512).optional(),
        limit: z.coerce.number().int().min(1).max(600).default(120),
        remote: z.enum(['true', 'false']).default('false'),
      })
      .safeParse(req.query);
    if (!query.success) throw new AppError('invalidRef');
    res.json(
      await readBranchTree(repo.path, {
        baseRef: query.data.base,
        limit: query.data.limit,
        includeRemote: query.data.remote === 'true',
      }),
    );
  });
  app.get('/api/repositories/:id/branch-comparison', async (req, res) => {
    const repo = await repository(req.params.id);
    const query = z
      .strictObject({
        source: z.string().min(1).max(512),
        target: z.string().min(1).max(512),
        sourceHash: hashSchema.optional(),
        targetHash: hashSchema.optional(),
      })
      .safeParse(req.query);
    if (!query.success) throw new AppError('invalidRef');
    res.json(
      await compareBranches(repo.path, {
        sourceRef: query.data.source,
        targetRef: query.data.target,
        sourceHash: query.data.sourceHash,
        targetHash: query.data.targetHash,
      }),
    );
  });
  app.get('/api/repositories/:id/history', async (req, res) => {
    const repo = await repository(req.params.id);
    const skip = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .safeParse(req.query.skip || 0);
    if (!skip.success) throw new AppError('invalidPage');
    const ref = z.string().refine(isCardRef).optional().safeParse(req.query.ref);
    if (!ref.success) throw new AppError('invalidRef');
    res.json(await getHistory(repo.path, skip.data, ref.data));
  });
  app.get('/api/repositories/:id/diff', async (req, res) => {
    const repo = await repository(req.params.id);
    const query = z
      .object({
        path: z.string().max(4000).optional(),
        staged: z.enum(['true', 'false']).optional(),
        commit: z.string().max(240).optional(),
      })
      .safeParse(req.query);
    if (!query.success) throw new AppError('invalidDiff');
    res.json(await getDiff(repo.path, { ...query.data, staged: query.data.staged === 'true' }));
  });
  app.get('/api/repositories/:id/remote-access', async (req, res) => {
    const repo = await repository(req.params.id);
    const parsed = z.string().min(1).max(240).safeParse(req.query.name);
    if (!parsed.success) throw new AppError('remoteName');
    res.json(await githubLoginAvailable(repo.path, parsed.data));
  });
  app.post('/api/repositories/:id/remote-access', async (req, res) => {
    const repo = await repository(req.params.id);
    const parsed = z
      .strictObject({
        name: z.string().min(1).max(240),
        action: z.enum(['read', 'githubLogin']),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new AppError('invalidAction');
    const { name, action } = parsed.data;
    const proxy = await network.proxy();
    res.json(
      await (action === 'read'
        ? checkRemoteRead(repo.path, name, proxy)
        : loginRemoteGitHub(repo.path, name, proxy)),
    );
  });
  app.post('/api/repositories/:id/actions', async (req, res) => {
    const repo = await repository(req.params.id);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('invalidAction');
    const worktreeRef = z.string().refine(isCardRef).optional().safeParse(req.query.worktreeRef);
    if (!worktreeRef.success) throw new AppError('invalidRef');
    const action = parsed.data as GitAction;
    const proxy = ['fetch', 'fetchRemote', 'pull', 'push', 'publishBranch'].includes(action.type)
      ? await network.proxy()
      : undefined;
    res.json({
      message: await performAction(repo.path, action, worktreeRef.data, proxy),
      state: await readRepository(repo.path),
    });
  });
  app.use('/api', (_req, res) =>
    res
      .status(404)
      .json({ code: 'endpointMissing', error: new AppError('endpointMissing').message }),
  );
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : (error as { status?: number }).status === 413
            ? 413
            : 500;
    res.status(status).json({ ...errorInfo(error), error: safeMessage(error) });
  };
  app.use(errorHandler);
  return app;
}
