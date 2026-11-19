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
} from './git.js';
import type { GitAction, RepoState, Snapshot } from '../shared/types.js';
import { listRepositoryImages, readRepositoryImage } from './repository-images.js';
import { readBranchTree, compareBranches } from './branch-tree.js';
import { pickLocal } from './local-picker.js';
import { realpath } from 'node:fs/promises';
import { aiRouter } from './ai.js';
import { readCommitContext } from './ai-commit.js';

const hashSchema = z.string().regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/);
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
  z.object({ type: z.enum(['fetch', 'pull', 'push']) }),
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

  async function repository(id: string) {
    const workspace = await store.read();
    const repo = workspace.repositories.find((r) => r.id === id);
    if (!repo) throw new AppError('repositoryMissing', 404);
    const normalized = await resolveRepository(repo.path);
    if (normalized.toLowerCase() !== repo.path.toLowerCase())
      throw new AppError('repositoryMoved', 409);
    return repo;
  }

  app.use(
    '/api/ai',
    aiRouter(
      options.dataDirectory,
      async (id) => readRepository((await repository(id)).path),
      async (id) => readCommitContext((await repository(id)).path),
    ),
  );
  app.get('/api/workspace', async (_req, res) => res.json(await store.read()));
  app.post('/api/local-picker/folder', async (_req, res) => res.json({ path: await pickLocal('folder') }));
  app.post('/api/repositories/:id/pick-image', async (req, res) => {
    const repo = await repository(req.params.id);
    const selected = await pickLocal('image', repo.path);
    if (!selected) return res.json({ path: null });
    const resolved = await realpath(selected).catch(() => { throw new AppError('repositoryImageMissing', 404); });
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
    const result: Snapshot = {
      repositories: {},
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
        result.relations[edge.id] = await inspectIntegration(
          source.path,
          target.path,
          edge.sourceRef,
          edge.targetRef,
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
    res.json(await getHistory(repo.path, skip.data));
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
  app.post('/api/repositories/:id/actions', async (req, res) => {
    const repo = await repository(req.params.id);
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('invalidAction');
    res.json({
      message: await performAction(repo.path, parsed.data as GitAction),
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
