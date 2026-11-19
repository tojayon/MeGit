import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProxyAgent } from 'undici';
import { z } from 'zod';
import type { ProxySettings } from '../shared/types.js';
import { AppError } from './errors.js';
import { remoteDestination } from './remote-destination.js';

const schema = z.strictObject({ enabled: z.boolean(), address: z.string().trim().max(2048) });

export function normalizeProxy(value: string) {
  const input = value.trim();
  const url = URL.parse(input);
  if (!url || !/^https?:\/\/[^/?#@\\\s]+\/?$/i.test(input) || url.username || url.password)
    throw new AppError('proxyInvalid');
  return url.origin;
}

export class NetworkSettings {
  private filename: string;

  constructor(private directory: string) {
    this.filename = path.join(directory, 'network-settings.json');
  }

  async read(): Promise<ProxySettings> {
    try {
      const { enabled, address } = schema.parse(JSON.parse(await readFile(this.filename, 'utf8')));
      return { enabled, address: (enabled || address) ? normalizeProxy(address) : '' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { enabled: false, address: '' };
      throw new AppError('proxyStorage', 503);
    }
  }

  async proxy() {
    const { enabled, address } = await this.read();
    return enabled ? address : undefined;
  }

  async save(input: unknown): Promise<ProxySettings> {
    const result = schema.safeParse(input);
    if (!result.success) throw new AppError('proxyInvalid');
    const { enabled, address } = result.data;
    const settings = { enabled, address: (enabled || address) ? normalizeProxy(address) : '' };
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(temporary, JSON.stringify(settings, null, 2), { flag: 'wx' });
      await rename(temporary, this.filename);
      return settings;
    } catch {
      throw new AppError('proxyStorage', 503);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
}

function loopback(host: string) {
  return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function gitProxyRoute(repo: string, address: string, proxy: string) {
  if (remoteDestination(repo, address, 'HEAD')?.kind === 'local' || address === '.') return '';
  const url = URL.parse(address);
  if (url && ['http:', 'https:'].includes(url.protocol)) return loopback(url.hostname) ? '' : proxy;
  if ((url?.protocol === 'ssh:' || url?.protocol === 'git:') && loopback(url.hostname)) return '';
  if (/^(?:[\w.-]+@)?(?:localhost|127\.0\.0\.1):[^:]/i.test(address)) return '';
  throw new AppError('proxyUnsupported', 422);
}

export function proxyEnvironment(proxy: string) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:(?:http|https|all|no)_proxy|gcm_http_proxy)$/i.test(key)));
  return { ...env, http_proxy: proxy, https_proxy: proxy, all_proxy: proxy, GCM_HTTP_PROXY: proxy, no_proxy: 'localhost,127.0.0.1,::1' };
}

export function proxyFailure(message: string) {
  if (/requested URL returned error: 407|proxy authentication|could not resolve proxy|proxy connect|CONNECT tunnel|Failed to connect to (?:127\.|localhost|\[?::1)/i.test(message))
    return 'proxyConnection';
  if (/operation too slow|operation timed out|(?:connection|connect) timed out/i.test(message)) return 'proxyTimeout';
  return undefined;
}

export function withProxyFetch(proxy?: string): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!proxy || loopback(url.hostname)) return fetch(input, init);
    const dispatcher = new ProxyAgent({ uri: proxy, connectTimeout: 5000 });
    try {
      const options = { ...init, dispatcher, redirect: 'error' as const };
      return await fetch(input, options as RequestInit);
    } catch (error) {
      const cause = (error as { cause?: { code?: string } })?.cause;
      throw new AppError(init?.signal?.aborted || cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ? 'proxyTimeout' : 'proxyConnection', 502);
    } finally {
      void dispatcher.close().catch(() => {});
    }
  };
}

export async function testNetworkProxy(address: string) {
  const response = await withProxyFetch(normalizeProxy(address))('https://github.com/', { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new AppError('proxyTestTarget', 502);
  return { connected: true };
}
