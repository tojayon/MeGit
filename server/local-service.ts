import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type {
  ActiveLocalService,
  LocalServiceCardState,
  LocalServiceConfig,
  LocalServiceState,
  LocalServiceTarget,
} from '../shared/local-service.js';
import { AppError, errorInfo } from './errors.js';
import { resolveRepository, runGit } from './git.js';
import { localApplication, startWindowsService } from './windows-local-service.js';

const targetSchema = z.strictObject({
  kind: z.enum(['npm', 'powershell']),
  entry: z.string().trim().min(1).max(500),
  directory: z.string().trim().min(1).max(500),
  port: z.number().int().min(1).max(65535).nullable(),
});
const revision = z.uuid();
const savedSchema = targetSchema.extend({
  revision,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
const saveSchema = targetSchema.extend({ revision: revision.nullable(), trusted: z.literal(true) });
const actionSchema = z.strictObject({ action: z.enum(['start', 'stop', 'restart']), revision });
const available = process.platform === 'win32';
const repositoryKey = (root: string) => path.resolve(root).toLowerCase();
const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const active = (record: Runtime | undefined) =>
  record?.status === 'running' || record?.status === 'starting' || record?.status === 'stopping';

type Saved = z.infer<typeof savedSchema>;
type Supervisor = ReturnType<typeof startWindowsService>;
type Runtime = Pick<LocalServiceState, 'status' | 'log' | 'error' | 'ownerPid' | 'runningSince'> & {
  supervisor?: Supervisor;
};

function relative(value: string, allowRoot: boolean) {
  const normalized = value.replaceAll('\\', '/');
  if (allowRoot && normalized === '.') return normalized;
  if (
    normalized
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.toLowerCase() === '.git' ||
          /[<>:"|?*]|[. ]$|~\d/i.test(segment) ||
          [...segment].some((char) => char.charCodeAt(0) < 32),
      )
  )
    throw new AppError('localServicePath');
  return normalized;
}

async function within(root: string, input: string, directory: boolean) {
  try {
    const resolved = await realpath(path.join(root, input));
    const rel = path.relative(root, resolved);
    if (rel) relative(rel, false);
    const info = await stat(resolved);
    if (directory ? !info.isDirectory() : !info.isFile()) throw new Error();
    return resolved;
  } catch {
    throw new AppError('localServicePath');
  }
}

async function inspect(root: string, target: LocalServiceTarget) {
  if (repositoryKey(await resolveRepository(root)) !== repositoryKey(root))
    throw new AppError('repositoryMoved', 409);
  const directory = await within(root, relative(target.directory, true), true);
  if (repositoryKey(await resolveRepository(directory)) !== repositoryKey(root))
    throw new AppError('localServicePath');
  const npm = target.kind === 'npm';
  const entry = npm ? target.entry : relative(target.entry, false);
  if (npm ? !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(entry) : !/\.ps1$/i.test(entry))
    throw new AppError('localServiceInvalid');
  const entryFile = await within(directory, npm ? 'package.json' : entry, false);
  if (path.extname(entryFile).toLowerCase() !== (npm ? '.json' : '.ps1'))
    throw new AppError('localServicePath');
  if (
    npm
      ? repositoryKey(entryFile) !== repositoryKey(path.join(directory, 'package.json'))
      : repositoryKey(await resolveRepository(path.dirname(entryFile))) !== repositoryKey(root)
  )
    throw new AppError('localServicePath');
  const application = localApplication(target.kind);
  if (!application || !(await stat(application).catch(() => null))?.isFile())
    throw new AppError('localServiceToolMissing', 503);
  const buffer = Buffer.alloc(512 * 1024 + 1);
  const handle = await open(entryFile, 'r');
  let limit = 0;
  try {
    while (limit < buffer.length) {
      const result = await handle.read(buffer, limit, buffer.length - limit);
      if (!result.bytesRead) break;
      limit += result.bytesRead;
    }
  } finally {
    await handle.close();
  }
  if (limit >= buffer.length) throw new AppError('localServiceInvalid');
  const bytes = buffer.subarray(0, limit);
  if (npm) {
    try {
      const manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (
        !manifest.scripts ||
        !Object.hasOwn(manifest.scripts, entry) ||
        typeof manifest.scripts[entry] !== 'string' ||
        !manifest.scripts[entry].trim()
      )
        throw new Error();
    } catch {
      throw new AppError('localServiceInvalid');
    }
  }
  const [ref, head] = await Promise.all([
    runGit(root, ['symbolic-ref', '--quiet', 'HEAD'], false, true),
    runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], false, true),
  ]);
  const entryHash = hash(bytes);
  const reference = ref.stdout.trim();
  const commit = head.stdout.trim();
  const fingerprint = hash(
    JSON.stringify([directory, entryFile, entryHash, reference, commit]),
  );
  return { target: { ...target, directory, entry: npm ? entry : entryFile }, fingerprint, entryHash, reference, commit };
}

const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

function cleanedLog(text: string) {
  return [...text.replace(ansi, '')]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || char === '\t' || char === '\n' || char === '\r';
    })
    .join('')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1***@')
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[redacted]');
}

export class LocalServices {
  private readonly records = new Map<string, Runtime>();
  private readonly pending = new Set<string>();
  private readonly directory: string;
  private closing = false;

  constructor(directory: string) {
    this.directory = path.join(directory, 'local-services');
  }

  activeServices(repositories: readonly { id: string; path: string }[]): ActiveLocalService[] {
    const services: ActiveLocalService[] = [];
    for (const repository of repositories) {
      const status = this.records.get(repositoryKey(repository.path))?.status;
      if (status === 'starting' || status === 'running' || status === 'stopping')
        services.push({ repoId: repository.id, status });
    }
    return services;
  }

  private filename(key: string) {
    return path.join(this.directory, `${hash(key)}.json`);
  }

  async cardStates(repositories: { id: string; path: string }[]): Promise<LocalServiceCardState[]> {
    const states: LocalServiceCardState[] = [];
    if (!available) return states;
    for (let index = 0; index < repositories.length; index += 16) {
      const batch = await Promise.all(
        repositories.slice(index, index + 16).map(async ({ id: repoId, path: root }) => {
          const key = repositoryKey(root);
          try {
            const config = await this.read(key);
            if (!config) return null;
            const record = this.records.get(key);
            return {
              repoId,
              revision: config.revision,
              status: record?.status ?? 'stopped',
              runningSince: record?.status === 'running' ? record.runningSince : undefined,
              error: record?.error,
            } satisfies LocalServiceCardState;
          } catch (error) {
            return {
              repoId,
              revision: null,
              status: 'failed',
              error: errorInfo(error),
            } satisfies LocalServiceCardState;
          }
        }),
      );
      for (const state of batch) if (state) states.push(state);
    }
    return states;
  }

  private async read(key: string) {
    try {
      return savedSchema.parse(JSON.parse(await readFile(this.filename(key), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new AppError('localServiceStorage', 500);
    }
  }

  async state(root: string): Promise<LocalServiceState> {
    const key = repositoryKey(root);
    const saved = available ? await this.read(key) : null;
    const config: LocalServiceConfig | null =
      saved &&
      targetSchema.extend({ revision }).parse({
        kind: saved.kind,
        directory: saved.directory,
        entry: saved.entry,
        port: saved.port,
        revision: saved.revision,
      });
    const record = this.records.get(key);
    return {
      available,
      config,
      status: record?.status ?? 'stopped',
      runningSince: record?.status === 'running' ? record.runningSince : undefined,
      log: cleanedLog(record?.log ?? ''),
      error: record?.error,
      ownerPid: record?.ownerPid,
    };
  }

  private async exclusive<T>(key: string, run: () => Promise<T>) {
    if (!available || this.closing) throw new AppError('localServiceUnavailable', 503);
    if (this.pending.has(key)) throw new AppError('localServiceActive', 409);
    this.pending.add(key);
    try {
      return await run();
    } finally {
      this.pending.delete(key);
    }
  }

  async save(root: string, input: unknown, reviewed?: { entryHash: string; reference: string; commit: string }) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) throw new AppError('localServiceInvalid');
    const key = repositoryKey(root);
    return this.exclusive(key, async () => {
      const previous = await this.read(key);
      if (parsed.data.revision !== (previous?.revision ?? null))
        throw new AppError('localServiceChanged', 409);
      if (this.records.get(key)?.supervisor) throw new AppError('localServiceActive', 409);
      const target: LocalServiceTarget = {
        kind: parsed.data.kind,
        directory: relative(parsed.data.directory, true),
        entry:
          parsed.data.kind === 'powershell'
            ? relative(parsed.data.entry, false)
            : parsed.data.entry,
        port: parsed.data.port,
      };
      const inspected = await inspect(root, target);
      if (reviewed && (inspected.entryHash !== reviewed.entryHash || inspected.reference !== reviewed.reference || inspected.commit !== reviewed.commit))
        throw new AppError('localServiceReview', 409);
      const saved: Saved = {
        ...target,
        fingerprint: inspected.fingerprint,
        revision: randomUUID(),
      };
      const filename = this.filename(key);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await mkdir(this.directory, { recursive: true });
        const handle = await open(temporary, 'wx');
        try {
          await handle.writeFile(JSON.stringify(saved));
        } finally {
          await handle.close();
        }
        await rename(temporary, filename);
      } catch {
        await rm(temporary, { force: true }).catch(() => {});
        throw new AppError('localServiceStorage', 500);
      }
      this.records.delete(key);
      return this.state(root);
    });
  }

  async action(root: string, input: unknown) {
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw new AppError('localServiceInvalid');
    const key = repositoryKey(root);
    return this.exclusive(key, async () => {
      const { action, revision } = parsed.data;
      const saved = await this.read(key);
      if (!saved || saved.revision !== revision) throw new AppError('localServiceChanged', 409);
      const record = this.records.get(key);
      if (action === 'stop') {
        await this.stop(record);
        return this.state(root);
      }
      if (action === 'start' && active(record)) throw new AppError('localServiceActive', 409);
      const inspectApproved = async () => {
        const current = await inspect(root, saved).catch((error: unknown) => {
          if (
            error instanceof AppError &&
            ['localServicePath', 'localServiceInvalid'].includes(error.code)
          )
            throw new AppError('localServiceReview', 409);
          throw error;
        });
        if (current.fingerprint !== saved.fingerprint)
          throw new AppError('localServiceReview', 409);
        return current.target;
      };
      let target = await inspectApproved();
      if (record?.supervisor) {
        if (action === 'restart' && active(record)) await this.stop(record);
        else await record.supervisor.done;
        target = await inspectApproved();
      }
      if (this.closing) throw new AppError('localServiceUnavailable', 503);
      if ([...this.records.values()].filter((item) => item.supervisor).length >= 12)
        throw new AppError('localServiceLimit', 409);
      this.launch(key, target);
      return this.state(root);
    });
  }

  private launch(key: string, target: LocalServiceTarget) {
    for (const [id, record] of this.records) {
      if (this.records.size < 64) break;
      if (!record.supervisor) this.records.delete(id);
    }
    const record: Runtime = { status: 'starting', log: '' };
    const supervisor = startWindowsService(
      target,
      (event) => {
        if (record.status === 'stopping') return;
        if ('status' in event) {
          if (event.status === 'running' && record.status !== 'running')
            record.runningSince = Date.now();
          record.status = event.status;
        } else {
          record.status = 'failed';
          record.error = { code: event.error };
          record.ownerPid = event.ownerPid;
        }
      },
      (text) => {
        record.log = (record.log + text).slice(-16000);
      },
      key,
    );
    this.records.set(key, record);
    record.supervisor = supervisor;
    void supervisor.done.then(() => {
      delete record.supervisor;
      if (record.status === 'stopping') {
        record.status = 'stopped';
        delete record.error;
        delete record.ownerPid;
      } else if (active(record)) {
        record.status = 'failed';
        record.error = { code: 'localServiceExited' };
      }
    });
  }

  private async stop(record: Runtime | undefined) {
    if (!record?.supervisor) return;
    record.status = 'stopping';
    await record.supervisor.stop();
  }

  async close() {
    this.closing = true;
    await Promise.all([...this.records.values()].map((record) => this.stop(record)));
  }
}
