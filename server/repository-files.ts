import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { parseTree, type Node as JsonNode, type ParseError } from 'jsonc-parser';
import {
  isRepositoryTextPath,
  textEditLimit,
  type RepositoryEditRequest,
  type RepositoryEditTarget,
  type RepositoryEditSnapshot,
  type RepositoryEditPreview,
} from '../shared/repository-files.js';
import { AppError } from './errors.js';
import { queueAction, runGit } from './git.js';

const lockLimit = 2 * 1024 * 1024;
const listingLimit = 260_000;
const approvalKey = randomBytes(32);
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const unsafeText = (value: string) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return true;
  }
  return false;
};
const equalPath = (first: string, second: string) =>
  process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileError = () => new AppError('repositoryEditPath');
const changedError = () => new AppError('repositoryEditChanged', 409);

function stat(filename: string) {
  try {
    return lstatSync(filename, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw fileError();
    return null;
  }
}

function location(root: string, relative: string) {
  if (!isRepositoryTextPath(relative)) throw fileError();
  const parts = relative.split('/');
  const name = parts.pop()!;
  let folder = root;
  const rootStat = stat(root);
  if (!rootStat?.isDirectory() || !equalPath(realpathSync.native(root), root)) throw fileError();
  for (const part of parts) {
    folder = path.join(folder, part);
    if (
      !stat(folder)?.isDirectory() ||
      !equalPath(realpathSync.native(folder), folder) ||
      stat(path.join(folder, '.git'))
    )
      throw fileError();
  }
  const filename = path.join(folder, name);
  const info = stat(filename);
  if (
    info &&
    (!info.isFile() || info.nlink !== 1n || !equalPath(realpathSync.native(filename), filename))
  )
    throw fileError();
  return { filename, info, rootIdentity: [String(rootStat.dev), String(rootStat.ino)] };
}

function readFile(root: string, relative: string, limit: number) {
  const { filename, info, rootIdentity } = location(root, relative);
  if (!info || info.size > limit) throw fileError();
  let handle: number | undefined;
  try {
    handle = openSync(filename, 'r');
    const opened = fstatSync(handle, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino ||
      opened.size > limit
    )
      throw fileError();
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    const after = fstatSync(handle, { bigint: true });
    if (
      offset !== Number(opened.size) ||
      opened.mtimeNs !== after.mtimeNs ||
      opened.ctimeNs !== after.ctimeNs
    )
      throw changedError();
    const content = bytes.subarray(0, offset).toString('utf8');
    if (!Buffer.from(content).equals(bytes.subarray(0, offset)) || unsafeText(content))
      throw fileError();
    const key = digest([
      rootIdentity,
      relative,
      String(info.dev),
      String(info.ino),
      String(info.mode),
      content,
    ]);
    return { path: relative, filename, mode: Number(info.mode & 0o777n), content, key, limit };
  } catch (error) {
    throw error instanceof AppError ? error : fileError();
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

async function verifyScope(root: string, paths: string[]) {
  const [reference, head, conflicts, ...ignored] = await Promise.all([
    runGit(root, ['symbolic-ref', '--quiet', 'HEAD'], false, true),
    runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], false, true),
    runGit(root, ['ls-files', '--unmerged', '-z', '--', ...paths], false, false, 2048),
    ...paths.map((name) =>
      runGit(
        root,
        ['--no-literal-pathspecs', 'check-ignore', '--quiet', '--no-index', '--', name],
        false,
        true,
      ),
    ),
  ]);
  if (ignored.some((result) => !('failed' in result)) || conflicts.stdout) throw fileError();
  return { ref: reference.stdout.trim(), head: head.stdout.trim() };
}

export async function listRepositoryFiles(repo: string) {
  const root = path.resolve(repo);
  const [all, ignored] = await Promise.all([
    runGit(
      root,
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      false,
      false,
      listingLimit,
    ),
    runGit(
      root,
      ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'],
      false,
      false,
      listingLimit,
    ),
  ]);
  const completeEntries = (output: string) => output.split('\0').slice(0, -1);
  const excluded = new Set(completeEntries(ignored.stdout));
  return [...new Set(completeEntries(all.stdout))]
    .filter((name) => isRepositoryTextPath(name) && !excluded.has(name))
    .sort(
      (first, second) =>
        Number(second === 'package.json') - Number(first === 'package.json') ||
        first.localeCompare(second),
    )
    .slice(0, 1200)
    .filter((name) => {
      try {
        const { info } = location(root, name);
        return !!info && info.size <= textEditLimit;
      } catch {
        return false;
      }
    })
    .slice(0, 600);
}

function jsonField(content: string, pointer: string) {
  const offset = Number(content.startsWith('\uFEFF'));
  const errors: ParseError[] = [];
  let item: JsonNode | undefined;
  try {
    item = parseTree(content.slice(offset), errors, { disallowComments: true });
  } catch {
    throw new AppError('repositoryEditField');
  }
  if (errors.length) throw new AppError('repositoryEditField');
  for (const key of pointer
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (item?.type === 'object') {
      const matches = item.children?.filter((property) => property.children?.[0]?.value === key);
      item = matches?.length === 1 ? matches[0].children?.[1] : undefined;
    } else if (item?.type === 'array' && /^(?:0|[1-9]\d*)$/.test(key)) {
      item = item.children?.[Number(key)];
    } else {
      item = undefined;
    }
  }
  if (!item || item.type === 'object' || item.type === 'array' || item.type === 'property')
    throw new AppError('repositoryEditField');
  const start = item.offset + offset;
  return {
    start,
    end: start + item.length,
    type: item.type,
    value: item.type === 'string' ? String(item.value) : content.slice(start, start + item.length),
  };
}

type FileSnapshot = ReturnType<typeof readFile>;
type Field = ReturnType<typeof jsonField>;

const npmLocks = (root: string) =>
  ['package-lock.json', 'npm-shrinkwrap.json'].filter((name) => !!location(root, name).info);

async function readTarget(root: string, target: RepositoryEditTarget) {
  const primary = target.kind === 'npm' ? 'package.json' : target.path;
  const locks = target.kind === 'npm' ? npmLocks(root) : [];
  const paths = [primary, ...locks];
  for (const name of paths) {
    if (!location(root, name).info) throw fileError();
  }
  const scope = await verifyScope(root, paths);
  if (target.kind === 'npm' && npmLocks(root).join() !== locks.join()) throw changedError();
  const files = paths.map((name) =>
    readFile(root, name, locks.includes(name) ? lockLimit : textEditLimit),
  );
  const first = files[0].content;
  const fields: Field[][] = [];
  let value = first.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  let valueType: RepositoryEditSnapshot['valueType'] = 'string';
  if (target.kind !== 'text') {
    const field = jsonField(first, target.kind === 'npm' ? '/version' : target.pointer);
    value = field.value;
    valueType = field.type;
    fields.push([field]);
    if (target.kind === 'npm' && field.type !== 'string') throw new AppError('repositoryEditField');
    for (const { content: lockFile } of files.slice(1)) {
      const lockVersion = jsonField(lockFile, '/lockfileVersion');
      const lockFields = [jsonField(lockFile, '/version')];
      if (lockVersion.value === '2' || lockVersion.value === '3')
        lockFields.push(jsonField(lockFile, '/packages//version'));
      else if (lockVersion.value !== '1') throw new AppError('repositoryEditField');
      if (lockFields.some((field) => field.type !== 'string'))
        throw new AppError('repositoryEditField');
      fields.push(lockFields);
    }
  }
  const revision = digest([root, scope, target, files.map(({ key }) => key)]);
  return {
    files,
    fields,
    scope,
    snapshot: { revision, value, valueType, branch: scope.ref.replace(/^refs\/heads\//, '') },
  };
}

export async function inspectRepositoryEdit(repo: string, target: RepositoryEditTarget) {
  return (await readTarget(path.resolve(repo), target)).snapshot;
}

function replaceFields(content: string, fields: Field[], value: string) {
  return [...fields]
    .sort((first, second) => second.start - first.start)
    .reduce(
      (result, field) => result.slice(0, field.start) + value + result.slice(field.end),
      content,
    );
}

function replacement(value: string, type: RepositoryEditSnapshot['valueType']) {
  if (type === 'string') return JSON.stringify(value);
  try {
    const next = JSON.parse(value.trim()) as unknown;
    if (
      (next === null ? 'null' : typeof next) !== type ||
      (typeof next === 'number' && !Number.isFinite(next))
    )
      throw new Error();
    return value.trim();
  } catch {
    throw new AppError('repositoryEditField');
  }
}

async function plan(root: string, request: RepositoryEditRequest) {
  const { files, fields, scope, snapshot } = await readTarget(root, request.target);
  if (snapshot.revision !== request.revision) throw changedError();
  if (
    request.target.kind === 'npm' &&
    (!versionPattern.test(request.value) || request.value.trim() !== request.value)
  )
    throw new AppError('repositoryEditVersion');
  if (unsafeText(request.value) || request.value !== Buffer.from(request.value).toString('utf8'))
    throw fileError();
  const changes = files
    .map((file, index) => {
      let after: string;
      if (request.target.kind === 'text') {
        const bom = file.content.startsWith('\uFEFF') ? '\uFEFF' : '';
        const withoutCrLf = file.content.replaceAll('\r\n', '');
        if (
          withoutCrLf.includes('\r') ||
          (file.content.includes('\r\n') && withoutCrLf.includes('\n'))
        )
          throw fileError();
        const normalized = request.value.replace(/\r\n?/g, '\n');
        after =
          bom + (file.content.includes('\r\n') ? normalized.replaceAll('\n', '\r\n') : normalized);
      } else {
        const next = replacement(request.value, snapshot.valueType);
        after = replaceFields(
          file.content,
          fields[index].filter((field) => field.value !== request.value),
          next,
        );
      }
      if (Buffer.byteLength(after) > file.limit) throw fileError();
      return { path: file.path, before: file.content, after };
    })
    .filter((change) => change.before !== change.after);
  if (!changes.length) throw new AppError('repositoryEditNoChange');
  const approval = createHmac('sha256', approvalKey)
    .update(JSON.stringify([snapshot.revision, changes]))
    .digest('hex');
  return { files, changes, approval, scope };
}

export async function previewRepositoryEdit(repo: string, request: RepositoryEditRequest) {
  const { changes, approval } = await plan(path.resolve(repo), request);
  const files: RepositoryEditPreview['files'] = changes.map(({ path: name, before, after }) => {
    const patch = createTwoFilesPatch(name, name, before, after, '', '', {
      context: 2,
      timeout: 350,
      maxEditLength: 15_000,
    });
    if (!patch || patch.length > 240_000) throw new AppError('repositoryEditDiff');
    return { path: name, patch };
  });
  return { changes, files, approval };
}

function writeTemporary(file: FileSnapshot, content: string) {
  const name = path.join(path.dirname(file.filename), `.megit-${randomUUID()}.tmp`);
  const handle = openSync(name, 'wx', file.mode);
  try {
    writeFileSync(handle, content, 'utf8');
  } catch (error) {
    closeSync(handle);
    rmSync(name, { force: true });
    throw error;
  }
  closeSync(handle);
  return name;
}

export function saveRepositoryEdit(
  repo: string,
  request: RepositoryEditRequest & { approval: string },
  access?: () => Promise<void>,
) {
  const root = path.resolve(repo);
  return queueAction(repo, async () => {
    await access?.();
    const result = await plan(root, request);
    if (result.approval !== request.approval) throw changedError();
    const prepared: { file: FileSnapshot; temporary: string }[] = [];
    const written: string[] = [];
    try {
      for (const change of result.changes) {
        const file = result.files.find((entry) => entry.path === change.path)!;
        if (readFile(root, file.path, file.limit).key !== file.key) throw changedError();
        prepared.push({ file, temporary: writeTemporary(file, change.after) });
      }
      await access?.();
      const current = await verifyScope(
        root,
        result.files.map((file) => file.path),
      );
      if (current.ref !== result.scope.ref || current.head !== result.scope.head)
        throw changedError();
      if (
        request.target.kind === 'npm' &&
        npmLocks(root).join() !==
          result.files
            .slice(1)
            .map((file) => file.path)
            .join()
      )
        throw changedError();
      for (const file of result.files) {
        if (readFile(root, file.path, file.limit).key !== file.key) throw changedError();
      }
      for (const { file, temporary } of prepared) {
        if (readFile(root, file.path, file.limit).key !== file.key) throw changedError();
        renameSync(temporary, file.filename);
        written.push(file.path);
      }
      return { written };
    } catch (error) {
      if (written.length || !(error instanceof AppError))
        throw new AppError('repositoryEditWrite', 409, written.join('\n'));
      throw error;
    } finally {
      for (const { temporary } of prepared) {
        try {
          rmSync(temporary, { force: true });
        } catch {
          continue;
        }
      }
    }
  });
}
