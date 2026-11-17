import { open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  isRepositoryAssetPath,
  isRepositoryImagePath,
  repositoryImageLimit,
} from '../shared/repository-images.js';
import type { RepositoryImage, RepositoryImages } from '../shared/types.js';
import { AppError } from './errors.js';

async function assetPath(root: string, relative: string, allowRoot = false) {
  if (!isRepositoryAssetPath(relative, allowRoot)) throw new AppError('invalidPath');
  const resolved = await realpath(path.join(root, relative)).catch(() => {
    throw new AppError('repositoryImageMissing', 404);
  });
  const within = path.relative(root, resolved).replaceAll('\\', '/');
  if (!isRepositoryAssetPath(within, allowRoot)) throw new AppError('outsideLink');
  return resolved;
}

export async function listRepositoryImages(
  root: string,
  directory: string,
  offset = 0,
): Promise<RepositoryImages> {
  const resolved = await assetPath(root, directory, true);
  if (!(await stat(resolved)).isDirectory()) throw new AppError('directoryRequired');
  const entries = (await readdir(resolved, { withFileTypes: true }))
    .filter(
      (entry) =>
        isRepositoryAssetPath(entry.name) &&
        (entry.isDirectory() || (entry.isFile() && isRepositoryImagePath(entry.name))),
    )
    .sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  return {
    directory,
    entries: entries.slice(offset, offset + 100).map((entry) => ({
      name: entry.name,
      path: directory ? `${directory}/${entry.name}` : entry.name,
      kind: entry.isDirectory() ? 'directory' : 'image',
    })),
    hasMore: offset + 100 < entries.length,
  };
}

function imageType(file: string, bytes: Buffer): string | undefined {
  const extension = path.extname(file).toLowerCase();
  if (
    extension === '.png' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    ['.jpg', '.jpeg'].includes(extension) &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg';
  if (extension === '.gif' && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (
    extension === '.webp' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (extension === '.ico' && bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])))
    return 'image/x-icon';
  if (extension === '.svg') {
    const source = bytes
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim();
    // SVG is returned only as a data URL for an <img>, never as markup or a document.
    if (
      /^(?:<\?xml\b[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(source) &&
      !/<!DOCTYPE|<!ENTITY/i.test(source)
    )
      return 'image/svg+xml';
  }
  return undefined;
}

export async function readRepositoryImage(
  root: string,
  relative: string,
): Promise<RepositoryImage> {
  if (!isRepositoryAssetPath(relative)) throw new AppError('invalidPath');
  if (!isRepositoryImagePath(relative)) throw new AppError('repositoryImageType');
  const resolved = await assetPath(root, relative);
  const file = await open(resolved, 'r').catch(() => {
    throw new AppError('repositoryImageMissing', 404);
  });
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new AppError('repositoryImageType');
    if (info.size > repositoryImageLimit) throw new AppError('repositoryImageSize');
    const buffer = Buffer.alloc(repositoryImageLimit + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await file.read(buffer, size, buffer.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > repositoryImageLimit) throw new AppError('repositoryImageSize');
    const bytes = buffer.subarray(0, size);
    const mimeType = imageType(relative, bytes);
    if (!mimeType) throw new AppError('repositoryImageType');
    return { path: relative, dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
  } finally {
    await file.close();
  }
}
