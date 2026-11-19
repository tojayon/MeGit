import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type {
  ChangedFile,
  Commit,
  DiffQuery,
  DiffResult,
  GitAction,
  RepoState,
  Repository,
} from '../../shared/types';
import { api, timeAgo } from '../lib/api';
import { Dialog } from './Dialogs';
import { formatError, type NoticeMessage } from '../lib/messages';
import { BranchTreePanel } from './BranchTreePanel';
import { CommitComposer } from './CommitComposer';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { PanelHeader } from './PanelHeader';
import { RepositoryInfo } from './RepositoryInfo';
import { GitHelp, HelpTip } from './GitHelp';
import { Tooltip } from './Tooltip';
import { RepositoryAvatar } from './RepositoryAvatar';
import {
  actionArguments,
  commitDiffArguments,
  fileDiffArguments,
  historyArguments,
  statusArguments,
} from '../../shared/git-commands';
import { CommitEvent } from './CommitEvent';
import { useViewState, useScrollMemory, viewStorage } from '../lib/use-view-state';
import { isText, isFiniteNumber } from '../lib/view-storage';

type DiffSelection = { title: string; query: DiffQuery };
const isDiffSelection = (value: unknown): value is DiffSelection | null => {
  if (value === null) return true;
  if (
    !value ||
    typeof value !== 'object' ||
    !('title' in value) ||
    !isText(value.title) ||
    !('query' in value) ||
    !value.query ||
    typeof value.query !== 'object'
  )
    return false;
  const q = value.query as DiffQuery;
  return (
    (q.path === undefined || isText(q.path)) &&
    (q.staged === undefined || typeof q.staged === 'boolean') &&
    (q.commit === undefined || (typeof q.commit === 'string' && /^[a-f\d]{40,64}$/i.test(q.commit)))
  );
};

function CommitGraph({ commits }: { commits: Commit[] }) {
  const { t } = useTranslation();
  const graph = useMemo(() => {
    const lanes = new Map<string, number>();
    let nextLane = 1;
    return commits.map((commit, index) => {
      const lane = lanes.get(commit.hash) ?? 0;
      const parentLanes = commit.parents.map((parent, n) => {
        if (!lanes.has(parent)) lanes.set(parent, n === 0 ? lane : nextLane++ % 3);
        return { lane: lanes.get(parent)!, index: commits.findIndex((c) => c.hash === parent) };
      });
      return { lane, index, parentLanes };
    });
  }, [commits]);
  return (
    <svg
      className="commit-graph"
      width="58"
      height={commits.length * 66}
      aria-label={t('repository.graph')}
      role="img"
    >
      {graph.map((row) => (
        <g key={row.index}>
          {row.parentLanes.map((parent, i) => {
            const x = 13 + row.lane * 14;
            const targetX = 13 + parent.lane * 14;
            const y = row.index * 66 + 24;
            const targetY = parent.index > row.index ? parent.index * 66 + 24 : y + 32;
            return (
              <path
                key={i}
                d={`M${x},${y} C${x},${y + 24} ${targetX},${targetY - 24} ${targetX},${targetY}`}
                fill="none"
                stroke={`var(--graph-${row.lane % 3})`}
                strokeWidth="1.6"
                strokeDasharray={parent.index < 0 ? '3 3' : undefined}
              />
            );
          })}
          <circle
            cx={13 + row.lane * 14}
            cy={row.index * 66 + 24}
            r={row.index === 0 ? 4.5 : 3.5}
            fill="var(--surface)"
            stroke={`var(--graph-${row.lane % 3})`}
            strokeWidth="2"
          />
        </g>
      ))}
    </svg>
  );
}

export function DiffDialog({
  repo,
  viewKey,
  selection,
  onClose,
}: {
  repo: Repository;
  viewKey?: string;
  selection: DiffSelection;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useScrollMemory(scroll, viewKey && `${viewKey}.content`, !!result);
  useEffect(() => {
    let active = true;
    api
      .diff(repo.id, selection.query)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [repo.id, selection]);
  return (
    <Dialog
      viewKey={viewKey}
      restoreReady={!!result || !!error}
      title={t('diff.title')}
      onClose={onClose}
      wide
      headerActions={
        <HelpTip
          topic={
            selection.query.commit
              ? 'commitDiff'
              : selection.query.staged
                ? 'stagedDiff'
                : 'workingDiff'
          }
        />
      }
    >
      <div className="diff-heading">
        <FileCode2 size={17} />
        <strong>{selection.title}</strong>
        <span className="repository-identity">
          <RepositoryAvatar repo={repo} size="small" />
          {repo.name}
        </span>
        {selection.query.commit && (
          <code title={t('diff.firstParent')}>{selection.query.commit.slice(0, 7)}</code>
        )}
      </div>
      {error ? (
        <p className="error-message diff-error" role="alert">
          {formatError(error)}
        </p>
      ) : !result ? (
        <div className="loading-region">
          <LoaderCircle className="spin" size={20} />
          {t('diff.reading')}
        </div>
      ) : (
        <div className="diff-view" data-testid="diff-view" ref={scroll}>
          <pre>
            {(result.notice ? t(`diff.${result.notice}`) : result.text || t('diff.empty'))
              .split('\n')
              .map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'diff-add'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'diff-remove'
                        : line.startsWith('@@')
                          ? 'diff-hunk'
                          : line.startsWith('diff ') || line.startsWith('index ')
                            ? 'diff-meta'
                            : ''
                  }
                >
                  <span className="diff-line-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{line || ' '}</span>
                </div>
              ))}
          </pre>
          {result.truncated && <p className="diff-truncated">{t('diff.truncated')}</p>}
        </div>
      )}
    </Dialog>
  );
}

function FileGroup({
  files,
  state,
  isStaged,
  busy,
  onAction,
  onDiff,
}: {
  files: ChangedFile[];
  state: RepoState;
  isStaged: boolean;
  busy: boolean;
  onAction: (action: GitAction) => Promise<void>;
  onDiff: (diff: DiffSelection) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="file-group">
      <header>
        <h3>
          {isStaged ? t('repository.staged') : t('repository.modified')}
          <span>{files.length}</span>
          <HelpTip
            topic={isStaged ? 'staged' : 'unstaged'}
            related={[isStaged ? 'unstage' : 'stage']}
          />
        </h3>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic={isStaged ? 'unstage' : 'stage'}
              preview={{
                commands: [
                  actionArguments(
                    { type: isStaged ? 'unstage' : 'stage', paths: files.map((file) => file.path) },
                    state,
                  ),
                ],
              }}
            />
          }
        >
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void onAction({
                type: isStaged ? 'unstage' : 'stage',
                paths: files.map((file) => file.path),
              })
            }
          >
            {isStaged ? t('repository.unstageAll') : t('repository.stageAll')}
          </button>
        </Tooltip>
      </header>
      {files.map((file) => (
        <div className="file-row" key={file.path}>
          <Tooltip
            detailed
            content={
              <GitHelp
                topic={file.conflicted ? 'conflict' : file.untracked ? 'untracked' : 'fileStatus'}
              />
            }
          >
            <span
              tabIndex={0}
              aria-label={t(
                `gitHelp.topics.${file.conflicted ? 'conflict' : file.untracked ? 'untracked' : 'fileStatus'}.title`,
              )}
              className={`file-status ${file.untracked ? 'untracked' : file.conflicted ? 'conflict' : ''}`}
            >
              {file.untracked ? 'U' : isStaged ? file.indexStatus : file.worktreeStatus}
            </span>
          </Tooltip>
          <Tooltip
            className="file-name-tip"
            detailed
            content={
              <>
                <strong>{file.path}</strong>
                <GitHelp
                  topic={isStaged ? 'stagedDiff' : 'workingDiff'}
                  preview={{
                    when: 'read',
                    commands: [fileDiffArguments(file, isStaged)],
                    empty: 'untracked',
                  }}
                />
              </>
            }
          >
            <button
              className="file-name"
              onClick={() =>
                onDiff({ title: file.path, query: { path: file.path, staged: isStaged } })
              }
            >
              {file.path}
              <ChevronRight size={13} />
            </button>
          </Tooltip>
          <IconButton
            size="small"
            help={
              <GitHelp
                topic={isStaged ? 'unstage' : 'stage'}
                preview={{
                  commands: [
                    actionArguments(
                      { type: isStaged ? 'unstage' : 'stage', paths: [file.path] },
                      state,
                    ),
                  ],
                }}
              />
            }
            label={t('repository.fileAction', {
              action: isStaged ? t('repository.unstage') : t('repository.stage'),
              path: file.path,
            })}
            disabled={busy}
            onClick={() =>
              void onAction({ type: isStaged ? 'unstage' : 'stage', paths: [file.path] })
            }
          >
            {isStaged ? <Minus size={15} /> : <Plus size={15} />}
          </IconButton>
        </div>
      ))}
    </section>
  );
}

function RepositoryToolsPanel({
  repo,
  viewKey,
  onReady,
  state,
  tab,
  message,
  setMessage,
  busy,
  handleAction,
  onCommitAction,
}: {
  repo: Repository;
  viewKey?: string;
  onReady?: (tab: 'worktree' | 'history', ready: boolean) => void;
  state?: RepoState;
  tab: 'worktree' | 'history';
  message: string;
  setMessage: (message: string) => void;
  busy: string;
  handleAction: (action: GitAction) => Promise<void>;
  onCommitAction: (action: GitAction) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(tab === 'history');
  const [hasMore, setHasMore] = useState(false);
  const [diff, setDiff] = useViewState(viewKey && `${viewKey}.diff`, null, isDiffSelection);
  const [historyCount] = useState(() => {
    const count = viewKey ? viewStorage.read(`${viewKey}.count`) : undefined;
    return isFiniteNumber(count) && count >= 40 && count <= 600 ? count : 40;
  });
  useEffect(() => {
    onReady?.(tab, !historyLoading && !!state);
  }, [onReady, historyLoading, tab, state]);
  const refFingerprint = state?.branches.map((branch) => `${branch.name}:${branch.hash}`).join('|');

  useEffect(() => {
    if (tab !== 'history') return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setHistoryLoading(true);
        setHistoryError('');
      }
    });
    (async () => {
      const data = await api.history(repo.id);
      let last = data.length;
      while (active && data.length < historyCount && last === 40) {
        const more = await api.history(repo.id, data.length);
        last = more.length;
        data.push(...more);
      }
      return data;
    })()
      .then((data) => {
        if (active) {
          setCommits(data);
          setHasMore(data.length > 0 && data.length % 40 === 0);
        }
      })
      .catch((err) => {
        if (active) setHistoryError(err);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repo.id, state?.head, refFingerprint, tab, historyCount]);

  const staged = state?.files.filter((f) => !f.untracked && f.indexStatus !== '.') || [];
  const unstaged = state?.files.filter((f) => f.untracked || f.worktreeStatus !== '.') || [];
  return (
    <>
      <div className="repo-ref">
        <GitBranch size={15} />
        <strong>
          {state
            ? state.detached
              ? t('repository.detached')
              : state.branch || t('repository.unknownBranch')
            : t('common.loading')}
        </strong>
        <HelpTip topic="branch" />
      </div>
      {tab === 'worktree' && (
        <CommitComposer
          state={state}
          message={message}
          onMessage={setMessage}
          busy={busy}
          onAction={onCommitAction}
        />
      )}
      <div className="remote-state">
        <span>
          <ArrowUp size={14} />
          {t('repository.aheadCount', { value: state?.ahead ?? '—' })}
        </span>
        <span>
          <ArrowDown size={14} />
          {t('repository.behindCount', { value: state?.behind ?? '—' })}
        </span>
        <HelpTip topic="sync" related={['fetch', 'pull', 'push']} />
      </div>
      <div className="repo-actions">
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="fetch"
              preview={{ commands: [actionArguments({ type: 'fetch' }, state)] }}
            />
          }
        >
          <Button
            busy={busy === 'fetch'}
            icon={<RefreshCw size={15} />}
            disabled={!!busy || !state?.remotes.length}
            onClick={() => void handleAction({ type: 'fetch' })}
          >
            {t('repository.fetch')}
          </Button>
        </Tooltip>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="pull"
              preview={{ commands: [actionArguments({ type: 'pull' }, state)] }}
            />
          }
        >
          <Button
            busy={busy === 'pull'}
            icon={<Download size={15} />}
            disabled={!!busy || !state?.upstream || state.detached}
            onClick={() => void handleAction({ type: 'pull' })}
          >
            {t('repository.pull')}
          </Button>
        </Tooltip>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="push"
              preview={{ commands: [actionArguments({ type: 'push' }, state)] }}
            />
          }
        >
          <Button
            busy={busy === 'push'}
            icon={<Upload size={15} />}
            disabled={!!busy || !state?.upstream || state.detached}
            onClick={() => void handleAction({ type: 'push' })}
          >
            {t('repository.push')}
          </Button>
        </Tooltip>
      </div>
      {state && (
        <p className="repo-sync-note">
          {state.detached
            ? t('repository.detached')
            : !state.remotes.length
              ? t('repository.noRemotes')
              : !state.upstream
                ? t('repository.noUpstream')
                : t('repository.cache')}
        </p>
      )}
      <div
        className="panel-content"
        role="region"
        aria-label={t(tab === 'worktree' ? 'repository.worktree' : 'repository.history')}
      >
        {tab === 'worktree' && (
          <>
            {state?.changed === 0 ? (
              <div className="clean-workspace">
                <div>
                  <Check size={23} />
                </div>
                <strong>{t('repository.clean')}</strong>
              </div>
            ) : (
              <>
                {unstaged.length > 0 && (
                  <FileGroup
                    files={unstaged}
                    state={state!}
                    isStaged={false}
                    busy={!!busy}
                    onAction={handleAction}
                    onDiff={setDiff}
                  />
                )}
                {staged.length > 0 && (
                  <FileGroup
                    files={staged}
                    state={state!}
                    isStaged
                    busy={!!busy}
                    onAction={handleAction}
                    onDiff={setDiff}
                  />
                )}
              </>
            )}
          </>
        )}
        {tab === 'history' && (
          <>
            {!!historyError && (
              <p className="error-message" role="alert">
                {formatError(historyError)}
              </p>
            )}
            {historyLoading ? (
              <div className="loading-region">
                <LoaderCircle className="spin" size={19} />
                {t('repository.readingCommits')}
              </div>
            ) : commits.length ? (
              <>
                <div className="commit-list">
                  <CommitGraph commits={commits} />
                  <div>
                    {commits.map((commit) => (
                      <Tooltip
                        key={commit.hash}
                        detailed
                        className="commit-row-tooltip"
                        content={
                          <>
                            <CommitEvent commit={commit} />
                            <GitHelp
                              topic="commitDiff"
                              preview={{
                                when: 'read',
                                commands: [commitDiffArguments(commit.hash)],
                              }}
                            />
                          </>
                        }
                      >
                        <button
                          className="commit-row"
                          onClick={() =>
                            setDiff({ title: commit.subject, query: { commit: commit.hash } })
                          }
                        >
                          <strong>{commit.subject}</strong>
                          <span>
                            <code>{commit.shortHash}</code>
                            <span>{commit.author}</span>
                            <time>{timeAgo(commit.date)}</time>
                          </span>
                          {commit.refs && <small title={commit.refs}>{commit.refs}</small>}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                {hasMore && (
                  <Tooltip
                    detailed
                    content={
                      <GitHelp
                        topic="history"
                        preview={{ when: 'read', commands: [historyArguments(commits.length)] }}
                      />
                    }
                  >
                    <button
                      className="button load-more"
                      onClick={async () => {
                        try {
                          const more = await api.history(repo.id, commits.length);
                          setCommits([...commits, ...more]);
                          if (viewKey)
                            viewStorage.write(
                              `${viewKey}.count`,
                              Math.min(600, commits.length + more.length),
                            );
                          setHasMore(more.length === 40);
                        } catch (err) {
                          setHistoryError(err);
                        }
                      }}
                    >
                      {t('repository.more')}
                    </button>
                  </Tooltip>
                )}
              </>
            ) : (
              <div className="panel-empty">
                <GitCommitHorizontal size={25} />
                <p>{t('repository.emptyHistory')}</p>
              </div>
            )}
          </>
        )}
      </div>
      {diff && (
        <DiffDialog
          repo={repo}
          viewKey={viewKey && `${viewKey}.diff.${JSON.stringify(diff.query)}`}
          selection={diff}
          onClose={() => setDiff(null)}
        />
      )}
    </>
  );
}

export function RepositoryPanel({
  repo,
  viewKey,
  state,
  onClose,
  onRefresh,
  onState,
  onNotice,
  onAvatar,
  avatarDisabled,
}: {
  repo: Repository;
  viewKey?: string;
  state?: RepoState;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onState: (state: RepoState) => void;
  onNotice: (text: NoticeMessage, error?: boolean) => void;
  onAvatar?: () => void;
  avatarDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useViewState(viewKey && `${viewKey}.draft`, '', isText);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [view, setView] = useViewState<'worktree' | 'history' | null>(
    viewKey && `${viewKey}.tools`,
    null,
    (v): v is 'worktree' | 'history' | null => v === null || v === 'worktree' || v === 'history',
  );
  const [readyView, setReadyView] = useState<{
    tab: 'worktree' | 'history';
    ready: boolean;
  } | null>(null);
  const onViewReady = useCallback((tab: 'worktree' | 'history', ready: boolean) => {
    setReadyView({ tab, ready });
  }, []);
  const openTools = useCallback(
    (tab: 'worktree' | 'history') => {
      setReadyView(null);
      setView(tab);
    },
    [setView],
  );
  const [diff, setDiff] = useViewState(viewKey && `${viewKey}.diff`, null, isDiffSelection);
  async function executeAction(operation: GitAction): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(operation.type);
    try {
      const result = await api.action(repo.id, operation);
      onState(result.state);
      if (operation.type === 'commit') setMessage('');
      await onRefresh();
      onNotice({ key: `actions.${operation.type}`, values: { name: repo.name } });
      return true;
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  async function handleAction(operation: GitAction) {
    try {
      await executeAction(operation);
    } catch (error) {
      onNotice(error as Error, true);
    }
  }

  return (
    <aside
      className="inspector repository-inspector"
      aria-label={t('repository.details', { name: repo.name })}
    >
      <PanelHeader
        title={repo.name}
        icon={<RepositoryAvatar repo={repo} size="large" />}
        iconAction={
          onAvatar
            ? {
                label: t('repositoryAvatar.configure'),
                help: t('repositoryAvatar.configureHelp'),
                onClick: onAvatar,
                disabled: avatarDisabled,
              }
            : undefined
        }
        closeLabel={t('repository.close')}
        onClose={onClose}
        actions={<RepositoryInfo repo={repo} state={state} />}
      />
      {state?.error ? (
        <div className="panel-error" role="alert">
          <CircleAlert size={19} />
          <p>{formatError(state.errorInfo || { code: 'unknown', details: state.error })}</p>
          <Tooltip
            detailed
            content={
              <GitHelp topic="checked" preview={{ when: 'read', commands: [statusArguments] }} />
            }
          >
            <Button onClick={() => void onRefresh()}>{t('repository.retry')}</Button>
          </Tooltip>
        </div>
      ) : (
        <BranchTreePanel
          viewKey={viewKey}
          repo={repo}
          state={state}
          busy={busy}
          onAction={executeAction}
          commitMessage={message}
          onCommitMessage={setMessage}
          commitVisible={view !== 'worktree'}
          onRefresh={onRefresh}
          onTools={openTools}
          onCommit={(commit) => setDiff({ title: commit.subject, query: { commit: commit.hash } })}
        />
      )}
      {view && (
        <Dialog
          key={view}
          viewKey={viewKey && `${viewKey}.${view}`}
          restoreReady={readyView?.tab === view && readyView.ready}
          title={t(view === 'worktree' ? 'repository.worktree' : 'repository.history')}
          wide
          busy={!!busy}
          onClose={() => setView(null)}
          className="repository-tools-dialog"
          headerActions={<HelpTip topic={view === 'worktree' ? 'worktree' : 'history'} />}
        >
          <div className="dialog-body">
            <RepositoryToolsPanel
              viewKey={viewKey && `${viewKey}.${view}`}
              onReady={onViewReady}
              repo={repo}
              state={state}
              tab={view}
              message={message}
              setMessage={setMessage}
              busy={busy}
              handleAction={handleAction}
              onCommitAction={executeAction}
            />
          </div>
        </Dialog>
      )}
      {diff && (
        <DiffDialog
          repo={repo}
          viewKey={viewKey && `${viewKey}.diff.${JSON.stringify(diff.query)}`}
          selection={diff}
          onClose={() => setDiff(null)}
        />
      )}
    </aside>
  );
}
