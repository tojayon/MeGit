import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Workspace } from '../shared/types.js';
import { AppError } from './errors.js';
import { resolveRepository } from './git.js';
import { isSafeRef } from '../shared/refs.js';
import { isCardRef } from '../shared/card-refs.js';
import { isRepositoryImagePath } from '../shared/repository-images.js';
import { readRepositoryImage } from './repository-images.js';

const id = z.string().min(1).max(100);
const ref = z.string().refine(isSafeRef);
const port = z.enum(['top', 'right', 'bottom', 'left']);
const point = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  activeBoardId: id,
  repositories: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(120),
        path: z.string().min(1).max(4000),
        logoPath: z.string().refine(isRepositoryImagePath).optional(),
        archived: z.boolean().optional(),
      }),
    )
    .max(200),
  boards: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500),
        nodes: z
          .array(
            z.object({
              id,
              repoId: id,
              position: point,
              ref: z.string().refine(isCardRef).optional(),
              displayName: z.string().trim().max(120).transform((name) => name || undefined).optional(),
            }),
          )
          .max(200),
        notes: z
          .array(
            z.object({
              id,
              title: z.string().trim().min(1).max(100),
              text: z.string().max(2000),
              kind: z.enum(['note', 'process', 'decision', 'start', 'end']).optional(),
              summary: z.string().max(200).optional(),
              position: point,
            }),
          )
          .max(200)
          .optional(),
        connections: z
          .array(
            z.object({
              id,
              source: id,
              target: id,
              label: z.string().max(100),
              sourcePort: port.optional(),
              targetPort: port.optional(),
              waypoints: z.array(point).max(20).optional(),
            }),
          )
          .max(600)
          .optional(),
        layoutLocked: z.boolean().optional(),
        edges: z
          .array(
            z.object({
              id,
              source: id,
              target: id,
              kind: z.enum(['integration', 'dependency', 'delivery']),
              label: z.string().max(100),
              sourceRef: ref.optional(),
              targetRef: ref.optional(),
              localIntegration: z.boolean().optional(),
              routing: z.enum(['smoothstep', 'step', 'bezier', 'straight']).optional(),
              waypoints: z.array(point).max(20).optional(),
              sourcePort: port.optional(),
              targetPort: port.optional(),
            }),
          )
          .max(600),
        groups: z
          .array(
            z.object({
              id,
              name: z.string().trim().min(1).max(100),
              nodeIds: z.array(id).max(200),
              collapsed: z.boolean(),
            }),
          )
          .max(200)
          .optional(),
        viewport: point.extend({ zoom: z.number().finite().min(0.1).max(3) }).optional(),
      }),
    )
    .min(1)
    .max(50),
});

function validate(data: unknown): Workspace {
  const result = workspaceSchema.safeParse(data);
  if (!result.success) throw new AppError('invalidWorkspace');
  const workspace = result.data;
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (
    !unique(workspace.repositories.map((r) => r.id)) ||
    !unique(workspace.boards.map((b) => b.id))
  )
    throw new AppError('duplicateId');
  if (!workspace.boards.some((b) => b.id === workspace.activeBoardId))
    throw new AppError('activeBoardMissing');
  const repoIds = new Set(workspace.repositories.map((r) => r.id));
  for (const board of workspace.boards) {
    if (
      !unique([...board.nodes, ...(board.notes || [])].map((n) => n.id)) ||
      !unique(board.edges.map((e) => e.id)) ||
      !unique(board.nodes.map((n) => JSON.stringify([n.repoId, n.ref ?? 'HEAD'])))
    )
      throw new AppError('duplicateNode');
    const nodes = new Set(board.nodes.map((n) => n.id));
    const endpoints = new Set([...nodes, ...(board.notes || []).map((n) => n.id)]);
    const connections = board.connections || [];
    if (
      connections.some(
        (e) => !endpoints.has(e.source) || !endpoints.has(e.target) || e.source === e.target,
      )
    )
      throw new AppError('invalidEdge');
    if (
      !unique([...board.edges, ...connections].map((e) => e.id)) ||
      !unique(connections.map((e) => `${e.source}:${e.target}:${e.label}`))
    )
      throw new AppError('duplicateRelation');
    const groups = board.groups || [];
    const members = groups.flatMap((g) => g.nodeIds);
    if (
      !unique(groups.map((g) => g.id)) ||
      !unique(members) ||
      groups.some(
        (g) => nodes.has(g.id) || board.notes?.some((n) => n.id === g.id) || !g.nodeIds.length,
      ) ||
      members.some((member) => !nodes.has(member))
    )
      throw new AppError('invalidGroup');
    if (board.nodes.some((n) => !repoIds.has(n.repoId))) throw new AppError('missingNodeRepo');
    if (
      board.edges.some((e) => !nodes.has(e.source) || !nodes.has(e.target) || e.source === e.target)
    )
      throw new AppError('invalidEdge');
    if (!unique(board.edges.map((e) => `${e.source}:${e.target}:${e.kind}`)))
      throw new AppError('duplicateRelation');
  }
  return workspace;
}

export class WorkspaceStore {
  private current?: Workspace;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}

  async read(): Promise<Workspace> {
    if (!this.current) {
      try {
        this.current = validate(
          JSON.parse(await readFile(path.join(this.directory, 'workspace.json'), 'utf8')),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new AppError('workspaceRead', 500);
        const boardId = randomUUID();
        this.current = {
          version: 1,
          revision: 0,
          activeBoardId: boardId,
          repositories: [],
          boards: [{ id: boardId, name: 'MeGit', description: '', nodes: [], edges: [] }],
        };
      }
    }
    return structuredClone(this.current);
  }

  async save(input: unknown): Promise<Workspace> {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const next = validate(input);
        const current = await this.read();
        if (next.revision !== current.revision) throw new AppError('workspaceConflict', 409);
        const normalized: string[] = [];
        for (const repo of next.repositories) {
          const existing = current.repositories.find(
            (r) => r.id === repo.id && r.path === repo.path,
          );
          const root = existing ? repo.path : await resolveRepository(repo.path);
          const comparable = process.platform === 'win32' ? root.toLowerCase() : root;
          if (normalized.includes(comparable)) throw new AppError('duplicatePath');
          normalized.push(comparable);
          repo.path = root;
          if (repo.logoPath && (!existing || existing.logoPath !== repo.logoPath)) {
            await readRepositoryImage(root, repo.logoPath);
          }
        }
        next.revision++;
        await mkdir(this.directory, { recursive: true });
        const temporary = path.join(this.directory, `workspace-${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporary, path.join(this.directory, 'workspace.json'));
        this.current = next;
        return structuredClone(next);
      });
    this.queue = operation;
    return operation;
  }
}
