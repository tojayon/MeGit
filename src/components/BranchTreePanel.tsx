import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Cloud,
  FileCode2,
  FolderGit2,
  GitBranchPlus,
  LoaderCircle,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BranchComparison,
  BranchTreeData,
  Commit,
  GitAction,
  RepoState,
  RemoteAction,
  Repository,
} from '../../shared/types';
import { api } from '../lib/api';
import { treeRefHash } from '../lib/branch-tree';
import { ApiError, formatError } from '../lib/messages';
import { dismissTooltips, focusWithoutTooltip } from '../lib/overlays';
import { BranchTree } from './BranchTree';
import { BranchComparisonPopover } from './BranchComparisonPopover';
import { BranchTrunkDialog } from './BranchTrunkDialog';
import { BranchDialog, type BranchSelection } from './BranchesPanel';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { GitHelp, HelpTip } from './GitHelp';
import { InfoPopover } from './InfoPopover';
import { PopupMenu } from './PopupMenu';
import { Tooltip } from './Tooltip';
import { CommitComposer } from './CommitComposer';
import { RepositoryAvatar } from './RepositoryAvatar';
import { RepositorySyncButtons } from './RepositorySyncButtons';
import { RemoteDestinationButton } from './RemoteDestinationButton';
import { RemoteActionDialog } from './RemoteActionDialog';
import { RemoteAccessRow, RemoteGitHubLogin } from './RemoteAccess';
import { RemoteManagement } from './RemoteManagement';
import { GitCommandPreview } from './GitCommandPreview';
import { useViewState, useScrollMemory } from '../lib/use-view-state';
import { isBoolean, isNullableText, isFiniteNumber } from '../lib/view-storage';
import {
  actionArguments,
  comparisonArguments,
  createBranchArguments,
  historyArguments,
  statusArguments,
  treeHistoryArguments,
} from '../../shared/git-commands';

export function BranchTreePanel({
  repo,
  cardRef,
  showWorktree = true,
  viewKey,
  state,
  busy,
  onAction,
  onRefresh,
  onTools,
  onCommit,
  commitMessage,
  onCommitMessage,
  onGenerateCommit,
  commitVisible,
}: {
  repo: Repository;
  cardRef?: string;
  showWorktree?: boolean;
  viewKey?: string;
  state?: RepoState;
  busy: string;
  onAction: (action: GitAction) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onTools: (view: 'worktree' | 'history') => void;
  onCommit: (commit: Commit) => void;
  commitMessage: string;
  onCommitMessage: (value: string) => void;
  onGenerateCommit: () => Promise<boolean>;
  commitVisible: boolean;
}) {
  const { t } = useTranslation();
  const [savedBaseRef, setSavedBaseRef] = useViewState(
    viewKey && `${viewKey}.base`,
    null,
    isNullableText,
  );
  const baseRef = savedBaseRef ?? cardRef;
  const setBaseRef = useCallback((ref?: string) => setSavedBaseRef(ref ?? null), [setSavedBaseRef]);
  const [remote, setRemote] = useViewState(viewKey && `${viewKey}.remote`, false, isBoolean);
  const [limit, setLimit] = useViewState(
    viewKey && `${viewKey}.limit`,
    120,
    (v): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= 600,
  );
  const [expanded, setExpanded] = useViewState(viewKey && `${viewKey}.expanded`, false, isBoolean);
  const [data, setData] = useState<BranchTreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [selectedRef, setSelectedRef] = useViewState(
    viewKey && `${viewKey}.selected`,
    null,
    isNullableText,
  );
  const [comparedRef, setComparedRef] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{ key: string; value: BranchComparison } | null>(
    null,
  );
  const [comparisonError, setComparisonError] = useState<{ key: string; error: unknown } | null>(
    null,
  );
  const [selection, setSelection] = useState<BranchSelection | null>(null);
  const [remoteAction, setRemoteAction] = useState<RemoteAction['type'] | null>(null);
  const [githubLogin, setGitHubLogin] = useState<{ repoId: string; name: string } | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('');
  const [choosingTrunk, setChoosingTrunk] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
  const detailScroll = useRef<HTMLDivElement>(null);
  const focusSelection = useRef(false);
  const focusAfterSearch = useRef(false);
  const fingerprint = state?.branches
    .map((branch) => `${branch.remote}:${branch.name}:${branch.hash}:${branch.inWorktree}`)
    .join('|');
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError(null);
      }
    });
    api
      .branchTree(repo.id, { baseRef, includeRemote: remote, limit })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (!active) return;
        if (
          err instanceof ApiError &&
          err.code === 'invalidRef' &&
          savedBaseRef &&
          savedBaseRef !== cardRef
        )
          setBaseRef(undefined);
        else setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    repo.id,
    baseRef,
    savedBaseRef,
    cardRef,
    setBaseRef,
    remote,
    limit,
    reload,
    fingerprint,
    state?.head,
    state?.branch,
    state?.detached,
    state?.upstream,
    state?.fetchedAt,
  ]);
  const branch = data?.branches.find((item) => item.ref === selectedRef);
  const comparedBranch = data?.branches.find((item) => item.ref === comparedRef);
  useEffect(() => {
    if (!data || loading || !selectedRef || branch) return;
    queueMicrotask(() => {
      setSelectedRef(null);
    });
  }, [data, loading, selectedRef, branch, setSelectedRef]);
  useEffect(() => {
    if (!data || loading || !comparedRef || comparedBranch) return;
    queueMicrotask(() => setComparedRef(null));
  }, [data, loading, comparedRef, comparedBranch, setComparedRef]);
  useLayoutEffect(() => {
    if (branch && focusSelection.current && !focusAfterSearch.current) {
      focusSelection.current = false;
      focusWithoutTooltip(detail.current);
    }
  }, [branch]);
  useEffect(() => {
    // Dialog unmount restores its opener first; search then hands focus to the chosen branch.
    if (branch && !searching && focusSelection.current && focusAfterSearch.current) {
      focusSelection.current = false;
      focusAfterSearch.current = false;
      focusWithoutTooltip(detail.current);
    }
  }, [branch, searching]);
  const trunkHash = data ? treeRefHash(data, data.baseRef) : null;
  const treeCommand = (nextRemote = remote, nextLimit = limit, hash = trunkHash) =>
    treeHistoryArguments(nextLimit, nextRemote, data?.head ?? state?.head ?? null, hash);
  const comparisonKey =
    comparedBranch && data?.baseRef && trunkHash
      ? `${comparedBranch.ref}:${comparedBranch.hash}:${data.baseRef}:${trunkHash}`
      : '';
  useEffect(() => {
    if (!comparedBranch || !data?.baseRef || !trunkHash || loading) return;
    let active = true;
    api
      .branchComparison(repo.id, comparedBranch.ref, data.baseRef, comparedBranch.hash, trunkHash)
      .then((value) => {
        if (active) {
          setComparison({ key: comparisonKey, value });
          setComparisonError(null);
        }
      })
      .catch((err) => {
        if (active) setComparisonError({ key: comparisonKey, error: err });
      });
    return () => {
      active = false;
    };
  }, [repo.id, comparedBranch, data?.baseRef, trunkHash, comparisonKey, loading]);
  const result = !loading && comparison?.key === comparisonKey ? comparison.value : null;
  const compareError =
    !loading && comparisonError?.key === comparisonKey ? comparisonError.error : null;
  useScrollMemory(
    detailScroll,
    viewKey && `${viewKey}.detail-scroll.${selectedRef}`,
    !!branch && !loading,
  );
  const blocked = !!busy || !!state?.operation || !state?.head || loading;
  const isCurrent =
    !!branch?.current &&
    !state?.detached &&
    state?.branch === branch.name &&
    state?.head === branch.hash;
  const upstreamUnavailable = isCurrent && !!state?.trackingConfigured && !state.pushTarget;
  const trunkName = data?.branches.find((item) => item.ref === data.baseRef)?.name || 'HEAD';
  function select(ref: string, fromSearch = false) {
    dismissTooltips();
    focusSelection.current = true;
    focusAfterSearch.current = fromSearch;
    if (selectedRef === ref && detail.current && !fromSearch) {
      focusSelection.current = false;
      focusWithoutTooltip(detail.current);
    }
    setSelectedRef(ref);
    setActionError(null);
  }
  function closeDetails() {
    focusSelection.current = false;
    focusAfterSearch.current = false;
    const target = Array.from(
      container.current?.querySelectorAll<HTMLButtonElement>('[data-ref]') || [],
    ).find((button) => button.dataset.ref === selectedRef);
    focusWithoutTooltip(target);
    setSelectedRef(null);
  }
  async function act(action: GitAction) {
    setActionError(null);
    try {
      await onAction(action);
      setReload((value) => value + 1);
    } catch (err) {
      setActionError(err);
    }
  }
  const tools = (
    <>
      <HelpTip
        topic="branchTree"
        related={['treeComparison', 'head', 'branchLabel', 'collapsedCommits', 'commitActions']}
      />
      {showWorktree && (!data || !!data.commits.length) && (
        <IconButton
          size="small"
          label={t('branchTree.worktree')}
          help={<GitHelp topic="worktree" preview={{ empty: 'view' }} />}
          onClick={() => onTools('worktree')}
        >
          <FileCode2 size={15} />
        </IconButton>
      )}
      {state && (
        <RemoteManagement
          count={state.remotes.length}
          fetchHelp={
            <GitHelp
              topic="fetch"
              preview={{ commands: [actionArguments({ type: 'fetch' }, state)] }}
            />
          }
          fetching={busy === 'fetch'}
          fetchDisabled={!!busy || loading}
          addDisabled={!!busy || !!state.error}
          onFetch={() => void act({ type: 'fetch' })}
          onAdd={() => setRemoteAction('addRemote')}
        >
          {state.remotes.map((name) => (
            <RemoteAccessRow
              key={`${repo.id}:${name}`}
              repoId={repo.id}
              name={name}
              disabled={!!busy || !!state.error}
              onLogin={() => setGitHubLogin({ repoId: repo.id, name })}
            />
          ))}
        </RemoteManagement>
      )}
      <PopupMenu
        label={t('branchTree.tools')}
        icon={<MoreHorizontal size={18} />}
        className="branch-tree-menu"
        triggerClassName="icon-button small"
        menuClassName="branch-tree-menu-items"
      >
        <Tooltip detailed content={<GitHelp topic="treeComparison" preview={{ empty: 'view' }} />}>
          <button
            disabled={loading || !data?.commits.length}
            onClick={() => setChoosingTrunk(true)}
          >
            {t('branchTree.changeTrunk')}
          </button>
        </Tooltip>
        <Tooltip detailed content={<GitCommandPreview empty="view" />}>
          <button
            onClick={() => {
              setFilter('');
              setSearching(true);
            }}
          >
            {t('branches.filter')}
          </button>
        </Tooltip>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="history"
              preview={{ when: 'read', commands: [historyArguments(0, cardRef)] }}
            />
          }
        >
          <button onClick={() => onTools('history')}>{t('branchTree.history')}</button>
        </Tooltip>
        <Tooltip
          detailed
          content={<GitCommandPreview when="read" commands={[treeCommand(!remote)]} />}
        >
          <button onClick={() => setRemote((value) => !value)}>
            {t(remote ? 'branchTree.hideRemote' : 'branchTree.showRemote')}
          </button>
        </Tooltip>
        <Tooltip detailed content={<GitCommandPreview empty="view" />}>
          <button onClick={() => setExpanded((value) => !value)}>
            {t(expanded ? 'branchTree.collapse' : 'branchTree.expand')}
          </button>
        </Tooltip>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="fetch"
              preview={{ commands: [actionArguments({ type: 'fetch' }, state)] }}
            />
          }
        >
          <button
            disabled={!!busy || loading || !state?.remotes.length}
            onClick={() => void act({ type: 'fetch' })}
          >
            {t('repository.fetch')}
          </button>
        </Tooltip>
        <Tooltip
          detailed
          content={
            <GitHelp
              topic="checked"
              preview={{ when: 'read', commands: [statusArguments, treeCommand()] }}
            />
          }
        >
          <button
            onClick={() => {
              setReload((value) => value + 1);
              void onRefresh().catch(setActionError);
            }}
          >
            {t('branches.refresh')}
          </button>
        </Tooltip>
      </PopupMenu>
    </>
  );
  return (
    <div className="branch-tree-panel" ref={container}>
      {!!actionError && (
        <p className="error-message" role="alert">
          {formatError(actionError)}
        </p>
      )}
      {state?.operation && (
        <p className="branch-tree-status warning-text" role="status">
          {t('branches.operation', { operation: t(`branches.operations.${state.operation}`) })} ·{' '}
          {t('errors.branchOperation')}
        </p>
      )}
      {showWorktree && state?.files.some((file) => file.conflicted) && (
        <Button
          variant="danger"
          className="branch-tree-conflict"
          onClick={() => onTools('worktree')}
        >
          {t('gitHelp.topics.conflict.title')} · {t('branchTree.worktree')}
        </Button>
      )}
      {data?.detached && (
        <p className="branch-tree-status warning-text">{t('branchTree.detached')}</p>
      )}
      <div className="branch-tree-stage" aria-busy={loading}>
        {(!!error || (data && !data.commits.length)) && (
          <div
            className="branch-tree-view-controls"
            role="group"
            aria-label={t('branchTree.mapControls')}
          >
            {tools}
          </div>
        )}
        {error ? (
          <div className="panel-error" role="alert">
            <p>{formatError(error)}</p>
            <Tooltip
              detailed
              content={<GitCommandPreview when="read" commands={[treeCommand()]} />}
            >
              <Button onClick={() => setReload((value) => value + 1)}>
                {t('repository.retry')}
              </Button>
            </Tooltip>
          </div>
        ) : !data ? (
          <div className="loading-region" role="status">
            <LoaderCircle className="spin" size={18} />
            {t('branchTree.reading')}
          </div>
        ) : !data.commits.length ? (
          <div className="panel-empty">
            <GitBranchPlus size={28} />
            <p>{t('branchTree.noCommits')}</p>
            {showWorktree && (
              <Button onClick={() => onTools('worktree')}>{t('branchTree.worktree')}</Button>
            )}
          </div>
        ) : (
          <>
            <BranchTree
              viewKey={viewKey && `${viewKey}.map`}
              data={data}
              selectedRef={selectedRef}
              comparison={result}
              comparisonControl={
                trunkHash
                  ? (tip) => (
                      <BranchComparisonPopover
                        branchName={tip.name}
                        trunkName={trunkName}
                        commands={comparisonArguments(tip.hash, trunkHash)}
                        retryCommands={[treeCommand(), ...comparisonArguments(tip.hash, trunkHash)]}
                        active={tip.ref === comparedRef}
                        result={tip.ref === comparedRef ? result : null}
                        error={tip.ref === comparedRef ? compareError : null}
                        onStart={() => {
                          setComparison(null);
                          setComparisonError(null);
                          setComparedRef(tip.ref);
                        }}
                        onClose={() =>
                          setComparedRef((current) => (current === tip.ref ? null : current))
                        }
                        onRetry={() => {
                          setComparisonError(null);
                          setReload((value) => value + 1);
                        }}
                      />
                    )
                  : undefined
              }
              expanded={expanded}
              onSelect={select}
              onCommit={onCommit}
              onCreateBranch={(commit) =>
                state && setSelection({ type: 'createBranch', state, startPoint: 'COMMIT', commit })
              }
              createDisabled={
                blocked
                  ? t(state?.operation ? 'errors.branchOperation' : 'branchTree.refreshing')
                  : undefined
              }
              tools={tools}
            />
            {loading && (
              <p className="branch-tree-refresh" role="status">
                {t('branchTree.refreshing')}
              </p>
            )}
            {branch && (
              <section
                ref={detail}
                tabIndex={-1}
                className="branch-tree-selection"
                role="region"
                aria-label={t('branchTree.selection')}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Escape' &&
                    !event.defaultPrevented &&
                    !(event.target as Element).closest('dialog')
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeDetails();
                  }
                }}
              >
                <header>
                  <RepositoryAvatar repo={repo} />
                  <div className="branch-tree-selection-heading">
                    <span className="branch-tree-selection-repository">{repo.name}</span>
                    <div className="branch-tree-selection-line">
                      <strong>{branch.name}</strong>
                      {branch.remote && branch.remoteDestination && (
                        <RemoteDestinationButton destination={branch.remoteDestination} />
                      )}
                      {((isCurrent && !loading) || branch.ref === data.baseRef) && (
                        <span className="branch-tree-selection-tags">
                          {isCurrent && !loading && (
                            <span className="branch-tree-current-tag">
                              <i aria-hidden="true" />
                              {t('branchTree.head')}
                            </span>
                          )}
                          {branch.ref === data.baseRef && (
                            <span>{t('branchTree.trunkLegend')}</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <InfoPopover label={t('branchTree.information')} help={<GitHelp topic="head" />}>
                    <dl className="repository-information">
                      <div>
                        <dt>{t('branchTree.reference')}</dt>
                        <dd>{branch.ref}</dd>
                      </div>
                      <div>
                        <dt>{t('repository.fullCommit')}</dt>
                        <dd>{branch.hash}</dd>
                      </div>
                      {branch.worktreePath && (
                        <div>
                          <dt>{t('branchTree.worktreePath')}</dt>
                          <dd>{branch.worktreePath}</dd>
                        </div>
                      )}
                      <div>
                        <dt>
                          {t('repository.upstream')}
                          <HelpTip topic="upstream" />
                        </dt>
                        <dd>{branch.upstream || t('branchTree.noUpstream')}</dd>
                      </div>
                    </dl>
                  </InfoPopover>
                  <IconButton
                    size="small"
                    label={t('branchTree.closeSelection')}
                    onClick={closeDetails}
                  >
                    <X size={15} />
                  </IconButton>
                </header>
                <div ref={detailScroll} className="branch-tree-selection-body">
                  {loading ? (
                    <p className="muted">{t('branchTree.refreshing')}</p>
                  ) : branch.inWorktree && !branch.current ? (
                    <p>{t('branchTree.occupied')}</p>
                  ) : branch.remote ? (
                    <p>{t('branchTree.remote')}</p>
                  ) : null}
                  {showWorktree && isCurrent && commitVisible && (
                    <div
                      className="branch-tree-detail-section"
                      role="group"
                      aria-label={t('repository.worktree')}
                    >
                      <div className="branch-tree-detail-section-header">
                        <strong>
                          <FolderGit2 size={15} aria-hidden="true" />
                          {t('repository.worktree')}
                        </strong>
                      </div>
                      {commitVisible && (
                        <CommitComposer
                          state={state}
                          message={commitMessage}
                          onMessage={onCommitMessage}
                          onGenerate={onGenerateCommit}
                          busy={busy}
                          disabled={loading}
                          showFileCount={false}
                          onAction={onAction}
                        />
                      )}
                    </div>
                  )}
                  {!branch.remote && (branch.upstream || isCurrent || branch.upstreamGone) && (
                    <div
                      className="branch-tree-detail-section branch-tree-sync-section"
                      role="group"
                      aria-label={t('repository.remoteSection')}
                    >
                      <div className="branch-tree-detail-section-header branch-tree-sync-heading">
                        <strong>
                          <Cloud size={15} aria-hidden="true" />
                          {t('repository.remoteSection')}
                        </strong>
                        <span
                          className={`branch-tree-tracking-name ${branch.upstreamGone || upstreamUnavailable ? 'warning-text' : 'muted'}`}
                        >
                          <span>
                            {upstreamUnavailable && !branch.upstreamGone
                              ? t('repository.upstreamUnavailable')
                              : !branch.upstream &&
                                  !branch.upstreamGone &&
                                  state &&
                                  !state.error &&
                                  !state.remotes.length
                                ? t('repository.noRemotes')
                                : branch.upstreamGone
                                  ? t('branchTree.upstreamGone')
                                  : branch.upstream
                                    ? t('branchTree.upstream', {
                                        name: branch.upstream.replace(/^refs\/remotes\//, ''),
                                      })
                                    : t('branchTree.noUpstream')}
                          </span>
                          <HelpTip topic="upstream" />
                          {branch.remoteDestination && (
                            <RemoteDestinationButton destination={branch.remoteDestination} />
                          )}
                        </span>
                      </div>
                      <div className="branch-tree-tracking">
                        {branch.upstream && !branch.upstreamGone && !upstreamUnavailable && (
                          <span className="branch-tree-sync">
                            <span>
                              {t('branchTree.aheadCount', { value: branch.ahead ?? '—' })}
                            </span>
                            <span aria-hidden="true">|</span>
                            <span>
                              {t('branchTree.behindCount', { value: branch.behind ?? '—' })}
                            </span>
                            <HelpTip topic="sync" related={['pull', 'push']} />
                          </span>
                        )}
                        {showWorktree && isCurrent && state && (
                          <div className="branch-tree-tracking-actions">
                            {state.pushTarget && !branch.upstreamGone
                              ? (
                                  <RepositorySyncButtons
                                    repositoryName={repo.name}
                                    state={state}
                                    busy={busy}
                                    disabled={blocked}
                                    compact
                                    onAction={async (action) => {
                                      setActionError(null);
                                      if (!(await onAction(action))) return false;
                                      setReload((value) => value + 1);
                                      return true;
                                    }}
                                  />
                                )
                              : state.remotes.length > 0 &&
                                !state.error && (
                                  <>
                                    {!state.trackingConfigured && (
                                      <Button
                                        size="compact"
                                        disabled={blocked}
                                        onClick={() => setRemoteAction('publishBranch')}
                                      >
                                        {t('remoteActions.publishBranchOpen')}
                                      </Button>
                                    )}
                                    <Button
                                      size="compact"
                                      disabled={blocked}
                                      onClick={() => setRemoteAction('setTracking')}
                                    >
                                      {t('remoteActions.setTrackingOpen')}
                                    </Button>
                                  </>
                                )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="branch-tree-actions">
                    {branch.remote ? (
                      <IconButton
                        label={t('branches.fromRemote', { name: branch.name })}
                        help={
                          <GitHelp
                            topic="tracking"
                            preview={{
                              when: 'confirm',
                              commands: [
                                createBranchArguments({
                                  name: branch.name.replace(/^[^/]+\//, ''),
                                  startPoint: branch.ref,
                                  startHash: branch.hash,
                                  track: true,
                                  checkout: false,
                                }),
                              ],
                            }}
                          />
                        }
                        disabled={blocked}
                        onClick={() =>
                          state &&
                          setSelection({ type: 'createBranch', state, startPoint: branch.ref })
                        }
                      >
                        <GitBranchPlus size={16} />
                      </IconButton>
                    ) : (
                      !branch.current && (
                        <>
                          <IconButton
                            label={t('branches.switchTo', { name: branch.name })}
                            help={
                              <GitHelp
                                topic="switchBranch"
                                preview={{
                                  when: 'confirm',
                                  commands: state
                                    ? [
                                        actionArguments(
                                          {
                                            type: 'switchBranch',
                                            name: branch.name,
                                            targetHash: branch.hash,
                                            expected: state,
                                          },
                                          state,
                                        ),
                                      ]
                                    : [],
                                }}
                              />
                            }
                            disabled={blocked || !!state?.changed || !!branch.inWorktree}
                            onClick={() =>
                              state && setSelection({ type: 'switchBranch', state, branch })
                            }
                          >
                            <ArrowRightLeft size={16} />
                          </IconButton>
                          <IconButton
                            variant="danger"
                            label={t('branches.deleteNamed', { name: branch.name })}
                            help={
                              <GitHelp
                                topic="deleteBranch"
                                preview={{
                                  when: 'confirm',
                                  commands: state
                                    ? [
                                        actionArguments(
                                          {
                                            type: 'deleteBranch',
                                            name: branch.name,
                                            targetHash: branch.hash,
                                            expected: state,
                                          },
                                          state,
                                        ),
                                      ]
                                    : [],
                                }}
                              />
                            }
                            disabled={blocked || !!branch.inWorktree}
                            onClick={() =>
                              state && setSelection({ type: 'deleteBranch', state, branch })
                            }
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </>
                      )
                    )}
                  </div>
                  {!branch.current && !!state?.changed && (
                    <p className="warning-text">{t('errors.dirtyBranch')}</p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {data && (data.hasMore || data.shallow) && (
        <div className="branch-tree-boundary-note">
          <span>{t(data.shallow ? 'branchTree.shallow' : 'branchTree.boundary')}</span>
          {data.hasMore &&
            (limit < 600 ? (
              <Tooltip
                detailed
                content={
                  <GitCommandPreview
                    when="read"
                    commands={[treeCommand(remote, Math.min(600, limit + 120))]}
                  />
                }
              >
                <button
                  className="text-button"
                  onClick={() => setLimit((value) => Math.min(600, value + 120))}
                >
                  {t('branchTree.more')}
                </button>
              </Tooltip>
            ) : (
              <span>{t('branchTree.limit')}</span>
            ))}
        </div>
      )}
      {githubLogin?.repoId === repo.id && (
        <RemoteGitHubLogin {...githubLogin} onClose={() => setGitHubLogin(null)} />
      )}
      {remoteAction && state && (
        <RemoteActionDialog
          type={remoteAction}
          state={state}
          busy={!!busy}
          onClose={() => setRemoteAction(null)}
          onAction={async (action) => {
            const success = await onAction(action);
            if (success) setReload((value) => value + 1);
            return success;
          }}
        />
      )}
      {selection && state && (
        <BranchDialog
          repo={repo}
          selection={selection}
          busy={!!busy}
          onAction={async (action) => {
            const success = await onAction(action);
            if (success) setReload((value) => value + 1);
            return success;
          }}
          onRefresh={onRefresh}
          onClose={() => setSelection(null)}
        />
      )}
      {choosingTrunk && data?.baseRef && (
        <BranchTrunkDialog
          value={data.baseRef}
          previewForRef={(ref) => ({
            when: 'read',
            commands: [
              treeCommand(
                remote,
                limit,
                treeRefHash(data, ref) ??
                  state?.branches.find(
                    (item) =>
                      `${item.remote ? 'refs/remotes/' : 'refs/heads/'}${item.name}` === ref,
                  )?.hash ??
                  null,
              ),
            ],
          })}
          options={[
            ...(data.detached ? [{ ref: 'HEAD', name: t('branchTree.head') }] : []),
            ...(state?.branches || data.branches).map((item) => ({
              ref: `${item.remote ? 'refs/remotes/' : 'refs/heads/'}${item.name}`,
              name: item.name,
            })),
          ]}
          onApply={(ref) => {
            setBaseRef(ref);
            setComparedRef(null);
            setChoosingTrunk(false);
          }}
          onClose={() => setChoosingTrunk(false)}
        />
      )}
      {searching && (
        <Dialog title={t('branches.filter')} onClose={() => setSearching(false)}>
          <div className="dialog-body">
            <Field label={t('branches.filter')}>
              <input
                type="search"
                autoFocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </Field>
            <div className="branch-tree-search-results">
              {(state?.branches || data?.branches || [])
                .filter((item) =>
                  item.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
                )
                .map((item) => (
                  <Button
                    key={`${item.remote}:${item.name}`}
                    onClick={() => {
                      if (item.remote) setRemote(true);
                      setSearching(false);
                      select(`${item.remote ? 'refs/remotes/' : 'refs/heads/'}${item.name}`, true);
                    }}
                  >
                    {item.name}
                  </Button>
                ))}
              {!(state?.branches || data?.branches || []).some((item) =>
                item.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
              ) && <p className="muted">{t('branches.noMatches')}</p>}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
