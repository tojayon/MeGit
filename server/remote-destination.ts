import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RemoteDestination } from '../shared/types.js';

export function remoteDestination(
  repo: string,
  address: string,
  branch: string,
): RemoteDestination | undefined {
  if (!branch || /\p{Cc}/u.test(address)) return;
  const github =
    /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w-]+)\/([\w.-]+)\/?$/i.exec(
      address,
    );
  if (github) {
    const name = github[2].replace(/\.git$/i, '');
    if (!name || name === '.' || name === '..') return;
    return {
      kind: 'web',
      value: `https://github.com/${github[1]}/${name}/tree/${encodeURIComponent(branch)}`,
    };
  }
  if (/^file:\/\//i.test(address)) {
    try {
      const url = new URL(address);
      if (url.hostname || url.search || url.hash) return;
      return { kind: 'local', value: fileURLToPath(url) };
    } catch {
      return;
    }
  }
  if (address && (path.isAbsolute(address) || !address.includes(':'))) {
    return { kind: 'local', value: path.resolve(repo, address) };
  }
}
