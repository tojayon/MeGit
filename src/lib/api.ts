import type {
  BranchComparison,
  BranchTreeData,
  Commit,
  DiffQuery,
  DiffResult,
  GitAction,
  RepoState,
  RepositoryImage,
  RepositoryImages,
  Snapshot,
  Workspace,
} from '../../shared/types';
import { i18n } from '../i18n';
import { ApiError } from './messages';
import { errorMessages, type ErrorInfo } from '../../shared/messages';

let session: Promise<string> | undefined;
async function token() {
  session ??= fetch('/api/session')
    .then(async (res) => {
      if (!res.ok) throw new ApiError('connection');
      return ((await res.json()) as { token: string }).token;
    })
    .catch((error) => {
      session = undefined;
      throw error instanceof ApiError ? error : new ApiError('connection');
    });
  return session;
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-MeGit-Token': await token(),
      ...options.headers,
    },
  }).catch(() => {
    throw new ApiError('connection');
  });
  const data = await res.json().catch(() => {
    throw new ApiError('connection');
  });
  if (!res.ok) {
    if (res.status === 403) session = undefined;
    const info = data as Partial<ErrorInfo>;
    throw new ApiError(
      info.code && Object.hasOwn(errorMessages, info.code) ? info.code : 'unknown',
      info.details,
    );
  }
  return data as T;
}
export const api = {
  generateCommit: (repositoryId: string, signal: AbortSignal) =>
    request<{ kind: 'commit'; text: string }>('/ai/assist', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        kind: 'commit',
        repositoryId,
        language: i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN',
      }),
    }),
  branchTree: (
    repoId: string,
    options: { baseRef?: string; limit?: number; includeRemote?: boolean } = {},
  ) => {
    const query = new URLSearchParams();
    if (options.baseRef) query.set('base', options.baseRef);
    if (options.limit) query.set('limit', String(options.limit));
    if (options.includeRemote) query.set('remote', 'true');
    return request<BranchTreeData>(
      `/repositories/${encodeURIComponent(repoId)}/branch-tree?${query}`,
    );
  },
  branchComparison: (
    repoId: string,
    source: string,
    target: string,
    sourceHash: string,
    targetHash: string,
  ) =>
    request<BranchComparison>(
      `/repositories/${encodeURIComponent(repoId)}/branch-comparison?${new URLSearchParams({ source, target, sourceHash, targetHash })}`,
    ),
  repositoryImages: (repoId: string, directory = '', offset = 0) =>
    request<RepositoryImages>(
      `/repositories/${encodeURIComponent(repoId)}/images?${new URLSearchParams({ directory, offset: String(offset) })}`,
    ),
  repositoryImage: (repoId: string, path: string) =>
    request<RepositoryImage>(
      `/repositories/${encodeURIComponent(repoId)}/image?${new URLSearchParams({ path })}`,
    ),
  workspace: () => request<Workspace>('/workspace'),
  save: (workspace: Workspace) =>
    request<Workspace>('/workspace', { method: 'PUT', body: JSON.stringify(workspace) }),
  inspect: (path: string) =>
    request<{ path: string; name: string; state: RepoState }>('/repositories/inspect', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  snapshot: (boardId: string) =>
    request<Snapshot>(`/snapshot?boardId=${encodeURIComponent(boardId)}`),
  history: (repoId: string, skip = 0) =>
    request<Commit[]>(`/repositories/${encodeURIComponent(repoId)}/history?skip=${skip}`),
  diff: (repoId: string, query: DiffQuery) => {
    const params = new URLSearchParams();
    if (query.path) params.set('path', query.path);
    if (query.commit) params.set('commit', query.commit);
    if (query.staged !== undefined) params.set('staged', String(query.staged));
    return request<DiffResult>(`/repositories/${encodeURIComponent(repoId)}/diff?${params}`);
  },
  action: (repoId: string, action: GitAction) =>
    request<{ message: string; state: RepoState }>(
      `/repositories/${encodeURIComponent(repoId)}/actions`,
      { method: 'POST', body: JSON.stringify(action) },
    ),
};

export function timeAgo(
  date?: string | null,
  language = i18n.resolvedLanguage || 'zh-CN',
  now = Date.now(),
) {
  if (!date || !Number.isFinite(new Date(date).getTime()))
    return i18n.t('time.never', { lng: language });
  const delta = Math.max(0, now - new Date(date).getTime());
  if (delta < 60_000) return i18n.t('time.now', { lng: language });
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
  if (delta < 3_600_000) return relative.format(-Math.floor(delta / 60_000), 'minute');
  if (delta < 86_400_000) return relative.format(-Math.floor(delta / 3_600_000), 'hour');
  return new Intl.DateTimeFormat(language).format(new Date(date));
}
