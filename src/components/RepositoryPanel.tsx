import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Terminal,
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
import { cardRefLabel, cardUsesWorktree } from '../../shared/card-refs';
import { CommitComposer, CommitStageButton } from './CommitComposer';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { PanelHeader } from './PanelHeader';
import { RepositoryInfo } from './RepositoryInfo';
import { GitHelp, HelpTip } from './GitHelp';
import { Tooltip } from './Tooltip';
import { RepositoryAvatar } from './RepositoryAvatar';
import { RepositorySyncButtons } from './RepositorySyncButtons';
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
import { useRepositoryActions } from '../lib/use-repository-actions';
import { LocalServiceDialog } from './LocalServiceDialog';

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
  scrollKey,
  emptyLabel,
}: {
  files: ChangedFile[];
  state: RepoState;
  isStaged: boolean;
  busy: string;
  onAction: (action: GitAction) => Promise<void>;
  onDiff: (diff: DiffSelection) => void;
  scrollKey?: string;
  emptyLabel: string;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const label = t(isStaged ? 'repository.staged' : 'repository.modified');
  useScrollMemory(scroll, scrollKey);
  const rows = files.map((file) => (
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
          type="button"
          className="file-name"
          onClick={() => onDiff({ title: file.path, query: { path: file.path, staged: isStaged } })}
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
        disabled={!!busy}
        onClick={() => void onAction({ type: isStaged ? 'unstage' : 'stage', paths: [file.path] })}
      >
        {isStaged ? <Minus size={15} /> : <Plus size={15} />}
      </IconButton>
    </div>
  ));
  return (
    <section className="file-group">
      <header>
        <h3>
          {label}
          <span>{files.length}</span>
          <HelpTip
            topic={isStaged ? 'staged' : 'unstaged'}
            related={[isStaged ? 'unstage' : 'stage']}
          />
        </h3>
        <CommitStageButton
          type={isStaged ? 'unstage' : 'stage'}
          paths={files.map((file) => file.path)}
          state={state}
          busy={busy}
          compact
          onAction={onAction}
        />
      </header>
      <div
        ref={scroll}
        className="worktree-file-list"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {rows.length ? rows : <p className="worktree-file-empty">{emptyLabel}</p>}
      </div>
    </section>
  );
}

export function RepositoryToolsPanel({
  repo,
  cardRef,
  viewKey,
  onReady,
  state,
  tab,
  message,
  setMessage,
  busy,
  handleAction,
  onAction,
  onGenerateCommit,
}: {
  repo: Repository;
  cardRef?: string;
  viewKey?: string;
  onReady?: (tab: 'worktree' | 'history', ready: boolean) => void;
  state?: RepoState;
  tab: 'worktree' | 'history';
  message: string;
  setMessage: (message: string) => void;
  busy: string;
  handleAction: (action: GitAction) => Promise<void>;
  onAction: (action: GitAction) => Promise<boolean>;
  onGenerateCommit: () => Promise<boolean>;
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
      const data = await api.history(repo.id, 0, cardRef);
      let last = data.length;
      while (active && data.length < historyCount && last === 40) {
        const more = await api.history(repo.id, data.length, cardRef);
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
  }, [repo.id, cardRef, state?.head, refFingerprint, tab, historyCount]);

  const staged = state?.files.filter((f) => !f.untracked && f.indexStatus !== '.') || [];
  const unstaged = state?.files.filter((f) => f.untracked || f.worktreeStatus !== '.') || [];
  const branchName = state
    ? state.detached
      ? t('repository.detached')
      : state.branch || t('repository.unknownBranch')
    : t('common.loading');
  const isWorktree = tab === 'worktree';
  const syncNote = state && (
    <p className="repo-sync-note">
      {state.detached
        ? t('repository.detached')
        : !state.remotes.length
          ? t('repository.noRemotes')
          : state.trackingConfigured && !state.pushTarget
            ? t('repository.upstreamUnavailable')
            : !state.upstream
              ? t('repository.noUpstream')
              : isWorktree
                ? t('branchTree.upstream', { name: state.upstream })
                : t('repository.cache')}
    </p>
  );
  const sync = (
    <>
      <div className="remote-state">
        {isWorktree ? (
          <>
            <span>{t('branchTree.aheadCount', { value: state?.ahead ?? '—' })}</span>
            <span aria-hidden="true">|</span>
            <span>{t('branchTree.behindCount', { value: state?.behind ?? '—' })}</span>
          </>
        ) : (
          <>
            <span>
              <ArrowUp size={14} />
              {t('repository.aheadCount', { value: state?.ahead ?? '—' })}
            </span>
            <span>
              <ArrowDown size={14} />
              {t('repository.behindCount', { value: state?.behind ?? '—' })}
            </span>
          </>
        )}
        <HelpTip topic="sync" related={['fetch', 'pull', 'push']} />
      </div>
      {isWorktree && syncNote}
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
            size={isWorktree ? 'compact' : 'default'}
            className={isWorktree ? 'branch-detail-action' : undefined}
            aria-label={t('repository.fetch')}
            busy={busy === 'fetch'}
            icon={<RefreshCw size={15} />}
            disabled={!!busy || !state?.remotes.length}
            onClick={() => void handleAction({ type: 'fetch' })}
          >
            {t('repository.fetch')}
          </Button>
        </Tooltip>
        <RepositorySyncButtons
          repositoryName={repo.name}
          state={state}
          busy={busy}
          compact={isWorktree}
          onAction={onAction}
        />
      </div>
      {!isWorktree && syncNote}
    </>
  );
  const diffDialog = diff && (
    <DiffDialog
      repo={repo}
      viewKey={viewKey && `${viewKey}.diff.${JSON.stringify(diff.query)}`}
      selection={diff}
      onClose={() => setDiff(null)}
    />
  );
  if (isWorktree) {
    return (
      <>
        <section className="worktree-dialog-sync" aria-label={t('repository.remoteSection')} tabIndex={0}>
          {sync}
        </section>
        <CommitComposer
          state={state}
          message={message}
          onMessage={setMessage}
          busy={busy}
          onAction={onAction}
          onGenerate={onGenerateCommit}
        >
          <div className="worktree-file-panes">
            {!state || state.error ? (
              <p className="repo-sync-note" role="status">
                {state?.error
                  ? formatError(state.errorInfo || { code: 'unknown', details: state.error })
                  : t('repository.reading')}
              </p>
            ) : (
              <>
                <FileGroup
                  files={unstaged}
                  state={state}
                  isStaged={false}
                  busy={busy}
                  onAction={handleAction}
                  onDiff={setDiff}
                  scrollKey={viewKey && `${viewKey}.unstaged.scroll`}
                  emptyLabel={t(state.changed ? 'repository.noModifiedFiles' : 'repository.clean')}
                />
                <FileGroup
                  files={staged}
                  state={state}
                  isStaged
                  busy={busy}
                  onAction={handleAction}
                  onDiff={setDiff}
                  scrollKey={viewKey && `${viewKey}.staged.scroll`}
                  emptyLabel={t('repository.noStagedFiles')}
                />
              </>
            )}
          </div>
        </CommitComposer>
        {diffDialog}
      </>
    );
  }
  return (
    <>
      <div className="repo-ref">
        <GitBranch size={15} />
        <strong>{branchName}</strong>
        <HelpTip topic="branch" />
      </div>
      {sync}
      <div className="panel-content" role="region" aria-label={t('repository.history')}>
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
                    preview={{
                      when: 'read',
                      commands: [historyArguments(commits.length, cardRef)],
                    }}
                  />
                }
              >
                <button
                  className="button load-more"
                  onClick={async () => {
                    try {
                      const more = await api.history(repo.id, commits.length, cardRef);
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
      </div>
      {diffDialog}
    </>
  );
}

export function RepositoryPanel({
  repo,
  cardRef,
  actionViewKey,
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
  cardRef?: string;
  actionViewKey?: string;
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
  const showWorktree = cardUsesWorktree(cardRef, state);
  const [showLocalService, setShowLocalService] = useState(false);
  const { message, setMessage, busy, executeAction, generateCommit } = useRepositoryActions({
    repo,
    worktreeRef: cardRef,
    viewKey: actionViewKey ?? viewKey,
    onState,
    onRefresh,
    onNotice,
  });
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
        title={cardRef ? `${repo.name} · ${cardRefLabel(cardRef)}` : repo.name}
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
        actions={
          <>
            <IconButton label={t('localService.title')} onClick={() => setShowLocalService(true)}>
              <Terminal size={16} />
            </IconButton>
            <RepositoryInfo repo={repo} state={state} />
          </>
        }
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
          cardRef={cardRef}
          showWorktree={showWorktree}
          viewKey={viewKey}
          repo={repo}
          state={state}
          busy={busy}
          onAction={executeAction}
          commitMessage={message}
          onCommitMessage={setMessage}
          onGenerateCommit={generateCommit}
          commitVisible={view !== 'worktree'}
          onRefresh={onRefresh}
          onTools={openTools}
          onCommit={(commit) => setDiff({ title: commit.subject, query: { commit: commit.hash } })}
        />
      )}
      {view && (view !== 'worktree' || showWorktree) && (
        <Dialog
          key={view}
          viewKey={viewKey && `${viewKey}.${view}`}
          restoreReady={readyView?.tab === view && readyView.ready}
          title={t(view === 'worktree' ? 'repository.worktree' : 'repository.history')}
          titleIcon={
            view === 'worktree' ? <RepositoryAvatar repo={repo} size="small" /> : undefined
          }
          titleDetail={
            view === 'worktree' ? (
              <div className="worktree-dialog-context">
                <span>{repo.name}</span>
                {state?.branch && !state.detached && (
                  <span className="worktree-dialog-branch">{state.branch}</span>
                )}
              </div>
            ) : undefined
          }
          wide
          busy={!!busy}
          onClose={() => setView(null)}
          className={`repository-tools-dialog${view === 'worktree' ? ' worktree-detail-dialog' : ''}`}
          headerActions={<HelpTip topic={view === 'worktree' ? 'worktree' : 'history'} />}
        >
          <div className="dialog-body">
            <RepositoryToolsPanel
              cardRef={cardRef}
              viewKey={viewKey && `${viewKey}.${view}`}
              onReady={onViewReady}
              repo={repo}
              state={state}
              tab={view}
              message={message}
              setMessage={setMessage}
              busy={busy}
              handleAction={handleAction}
              onAction={executeAction}
              onGenerateCommit={generateCommit}
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
      {showLocalService && (
        <LocalServiceDialog key={repo.id} repo={repo} onClose={() => setShowLocalService(false)} />
      )}
    </aside>
  );
}
