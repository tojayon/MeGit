import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { httpRemoteHasCredentials } from '../shared/git-commands.js';
import type { RemoteReadStatus } from '../shared/types.js';
import { AppError } from './errors.js';
import { routeGitAddress, runGit } from './git.js';
import { proxyEnvironment, proxyFailure } from './network-proxy.js';
import { remoteDestination } from './remote-destination.js';

const execute = promisify(execFile);
let githubLoginPending = false;

async function readAddress(repo: string, name: string) {
  if (!name || name === '.' || name.startsWith('-') || /\p{Cc}/u.test(name))
    throw new AppError('remoteNotConfigured', 409);
  try {
    return (await runGit(repo, ['remote', 'get-url', '--', name])).stdout.trim();
  } catch (error) {
    if (error instanceof AppError && /no such remote/i.test(error.details ?? ''))
      throw new AppError('remoteNotConfigured', 409);
    throw error;
  }
}

export function remoteReadFailure(message: string): RemoteReadStatus {
  if (/authentication failed|could not read (?:username|password)|terminal prompts disabled|permission denied \(publickey|invalid username or token|returned error: 401/i.test(message))
    return 'remoteReadAuth';
  if (/could not resolve (?:host|proxy|hostname)|failed to connect|connection (?:refused|timed out|reset)|network is unreachable|no route to host/i.test(message))
    return 'remoteReadNetwork';
  return 'remoteReadUnknown';
}

export async function checkRemoteRead(repo: string, name: string, proxy?: string): Promise<{ status: RemoteReadStatus }> {
  let local = false;
  try {
    const address = await readAddress(repo, name);
    if (httpRemoteHasCredentials(address)) return { status: 'remoteDestinationCredentials' };
    local = remoteDestination(repo, address, 'HEAD')?.kind === 'local';
    const options = routeGitAddress(repo, name, address, proxy);
    await runGit(repo, ['ls-remote', '--quiet', '--upload-pack=git-upload-pack', '--', name, 'HEAD'], true, false, undefined, true, options);
    return { status: 'readable' };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'gitTimeout' || error.code === 'gitMissing' || error.code === 'remoteNotConfigured')
        return { status: error.code };
      if (error.code === 'proxyConnection' || error.code === 'proxyTimeout' || error.code === 'proxyUnsupported')
        return { status: error.code };
      if (local) return { status: 'remoteReadLocal' };
      return { status: remoteReadFailure(error.details ?? '') };
    }
    throw error;
  }
}

export async function githubLoginAvailable(repo: string, name: string) {
  const address = await readAddress(repo, name);
  return { githubLogin: /^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/i.test(address) };
}

export async function loginRemoteGitHub(repo: string, name: string, proxy?: string) {
  if (!(await githubLoginAvailable(repo, name)).githubLogin) throw new AppError('remoteGitHubOnly');
  if (githubLoginPending) throw new AppError('remoteGitHubBusy', 409);
  githubLoginPending = true;
  try {
    const options = proxy ? ['-c', `http.https://github.com/.proxy=${proxy}`] : [];
    await execute('git', [...options, 'credential-manager', 'github', 'login', '--browser', '--url', 'https://github.com'], {
      cwd: repo,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 64 * 1024,
      env: { ...(proxy ? proxyEnvironment(proxy) : process.env), GCM_INTERACTIVE: 'true', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    });
    return { completed: true };
  } catch (error) {
    const result = error as { code?: string; killed?: boolean; stderr?: string };
    if (result.code === 'ENOENT') throw new AppError('gitMissing');
    if (result.killed) throw new AppError('gitTimeout', 504);
    const proxyError = proxy && proxyFailure(result.stderr ?? '');
    if (proxyError) throw new AppError(proxyError, 502);
    if (/credential-manager.*not a git command/i.test(result.stderr ?? ''))
      throw new AppError('remoteGitHubManagerMissing', 422);
    throw new AppError('remoteGitHubLoginFailed', 422);
  } finally {
    githubLoginPending = false;
  }
}
