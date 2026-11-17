import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Button } from './Button';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { PanelHeader } from './PanelHeader';
import { RepositoryInfo } from './RepositoryInfo';
import { GitHelp, HelpTip } from './GitHelp';
import { Tooltip } from './Tooltip';
import { RepositoryAvatar } from './RepositoryAvatar';

type DiffSelection = { title: string; query: DiffQuery };

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
  selection,
  onClose,
}: {
  repo: Repository;
  selection: DiffSelection;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<unknown>(null);
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
        <div className="diff-view" data-testid="diff-view">
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
  isStaged,
  busy,
  onAction,
  onDiff,
}: {
  files: ChangedFile[];
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
        <Tooltip detailed content={<GitHelp topic={isStaged ? 'unstage' : 'stage'} />}>
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
                <GitHelp topic={isStaged ? 'stagedDiff' : 'workingDiff'} />
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
            help={<GitHelp topic={isStaged ? 'unstage' : 'stage'} />}
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
  state,
  tab,
  message,
  setMessage,
  busy,
  handleAction,
}: {
  repo: Repository;
  state?: RepoState;
  tab: 'worktree' | 'history';
  message: string;
  setMessage: (message: string) => void;
  busy: string;
  handleAction: (action: GitAction) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [diff, setDiff] = useState<DiffSelection | null>(null);
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
    api
      .history(repo.id)
      .then((data) => {
        if (active) {
          setCommits(data);
          setHasMore(data.length === 40);
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
  }, [repo.id, state?.head, refFingerprint, tab]);

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
        <Tooltip detailed content={<GitHelp topic="fetch" />}>
          <Button
            busy={busy === 'fetch'}
            icon={<RefreshCw size={15} />}
            disabled={!!busy || !state?.remotes.length}
            onClick={() => void handleAction({ type: 'fetch' })}
          >
            {t('repository.fetch')}
          </Button>
        </Tooltip>
        <Tooltip detailed content={<GitHelp topic="pull" />}>
          <Button
            busy={busy === 'pull'}
            icon={<Download size={15} />}
            disabled={!!busy || !state?.upstream || state.detached}
            onClick={() => void handleAction({ type: 'pull' })}
          >
            {t('repository.pull')}
          </Button>
        </Tooltip>
        <Tooltip detailed content={<GitHelp topic="push" />}>
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
                    isStaged={false}
                    busy={!!busy}
                    onAction={handleAction}
                    onDiff={setDiff}
                  />
                )}
                {staged.length > 0 && (
                  <FileGroup
                    files={staged}
                    isStaged
                    busy={!!busy}
                    onAction={handleAction}
                    onDiff={setDiff}
                  />
                )}
              </>
            )}
            {staged.length > 0 && (
              <form
                className="commit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAction({ type: 'commit', message });
                }}
              >
                <div className="commit-help">
                  <HelpTip topic="commit" />
                </div>
                <Field label={t('repository.message')}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('repository.messagePlaceholder')}
                    rows={3}
                    maxLength={10000}
                  />
                </Field>
                <Tooltip detailed content={<GitHelp topic="commit" />}>
                  <Button
                    type="submit"
                    variant="primary"
                    busy={busy === 'commit'}
                    icon={<GitCommitHorizontal size={16} />}
                    disabled={!!busy || !message.trim()}
                  >
                    {t('repository.commitFiles', { count: staged.length })}
                  </Button>
                </Tooltip>
              </form>
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
                      <button
                        className="commit-row"
                        key={commit.hash}
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
                    ))}
                  </div>
                </div>
                {hasMore && (
                  <button
                    className="button load-more"
                    onClick={async () => {
                      try {
                        const more = await api.history(repo.id, commits.length);
                        setCommits([...commits, ...more]);
                        setHasMore(more.length === 40);
                      } catch (err) {
                        setHistoryError(err);
                      }
                    }}
                  >
                    {t('repository.more')}
                  </button>
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
      {diff && <DiffDialog repo={repo} selection={diff} onClose={() => setDiff(null)} />}
    </>
  );
}

export function RepositoryPanel({
  repo,
  state,
  onClose,
  onRefresh,
  onState,
  onNotice,
  onAvatar,
  avatarDisabled,
}: {
  repo: Repository;
  state?: RepoState;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onState: (state: RepoState) => void;
  onNotice: (text: NoticeMessage, error?: boolean) => void;
  onAvatar?: () => void;
  avatarDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [view, setView] = useState<'worktree' | 'history' | null>(null);
  const [diff, setDiff] = useState<DiffSelection | null>(null);
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
          <Button onClick={() => void onRefresh()}>{t('repository.retry')}</Button>
        </div>
      ) : (
        <BranchTreePanel
          repo={repo}
          state={state}
          busy={busy}
          onAction={executeAction}
          onRefresh={onRefresh}
          onTools={setView}
          onCommit={(commit) => setDiff({ title: commit.subject, query: { commit: commit.hash } })}
        />
      )}
      {view && (
        <Dialog
          title={t(view === 'worktree' ? 'repository.worktree' : 'repository.history')}
          wide
          busy={!!busy}
          onClose={() => setView(null)}
          className="repository-tools-dialog"
          headerActions={<HelpTip topic={view === 'worktree' ? 'worktree' : 'history'} />}
        >
          <div className="dialog-body">
            <RepositoryToolsPanel
              repo={repo}
              state={state}
              tab={view}
              message={message}
              setMessage={setMessage}
              busy={busy}
              handleAction={handleAction}
            />
          </div>
        </Dialog>
      )}
      {diff && <DiffDialog repo={repo} selection={diff} onClose={() => setDiff(null)} />}
    </aside>
  );
}
