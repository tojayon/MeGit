import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Download,
  FileCode2,
  GitBranchPlus,
  GitBranch,
  GitCompareArrows,
  History,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  BranchComparison,
  BranchTreeData,
  Commit,
  GitAction,
  RepoState,
  Repository,
} from '../../shared/types';
import { api } from '../lib/api';
import { treeRefHash } from '../lib/branch-tree';
import { ApiError, formatError } from '../lib/messages';
import { dismissTooltips, focusWithoutTooltip } from '../lib/overlays';
import { BranchTree } from './BranchTree';
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

export function BranchTreePanel({
  repo,
  state,
  busy,
  onAction,
  onRefresh,
  onTools,
  onCommit,
}: {
  repo: Repository;
  state?: RepoState;
  busy: string;
  onAction: (action: GitAction) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onTools: (view: 'worktree' | 'history') => void;
  onCommit: (commit: Commit) => void;
}) {
  const { t } = useTranslation();
  const [baseRef, setBaseRef] = useState<string>();
  const [remote, setRemote] = useState(false);
  const [limit, setLimit] = useState(120);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<BranchTreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<{ key: string; value: BranchComparison } | null>(
    null,
  );
  const [comparisonError, setComparisonError] = useState<{ key: string; error: unknown } | null>(
    null,
  );
  const [selection, setSelection] = useState<BranchSelection | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('');
  const [choosingTrunk, setChoosingTrunk] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
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
        if (err instanceof ApiError && err.code === 'invalidRef' && baseRef) setBaseRef(undefined);
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
  const comparisonKey =
    branch && data?.baseRef && trunkHash
      ? `${branch.ref}:${branch.hash}:${data.baseRef}:${trunkHash}`
      : '';
  useEffect(() => {
    if (!comparing || !branch || !data?.baseRef || !trunkHash || loading) return;
    let active = true;
    api
      .branchComparison(repo.id, branch.ref, data.baseRef, branch.hash, trunkHash)
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
  }, [repo.id, branch, data?.baseRef, trunkHash, comparing, comparisonKey, loading]);
  const result =
    comparing && !loading && comparison?.key === comparisonKey ? comparison.value : null;
  const compareError =
    comparing && comparisonError?.key === comparisonKey ? comparisonError.error : null;
  const blocked = !!busy || !!state?.operation || !state?.head || loading;
  const isCurrent =
    !!branch?.current &&
    !state?.detached &&
    state?.branch === branch.name &&
    state?.head === branch.hash;
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
    setComparing(false);
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
    setComparing(false);
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
      <HelpTip topic="branchTree" related={['treeComparison']} />
      <IconButton
        size="small"
        label={t('branches.new')}
        help={<GitHelp topic="createBranch" />}
        disabled={blocked}
        onClick={() => state && setSelection({ type: 'createBranch', state, startPoint: 'HEAD' })}
      >
        <GitBranchPlus size={17} />
      </IconButton>
      <PopupMenu
        label={t('branchTree.tools')}
        icon={<MoreHorizontal size={18} />}
        className="branch-tree-menu"
        triggerClassName="icon-button small"
        menuClassName="branch-tree-menu-items"
      >
        <button disabled={loading || !data?.commits.length} onClick={() => setChoosingTrunk(true)}>
          {t('branchTree.changeTrunk')}
        </button>
        <button
          onClick={() => {
            setFilter('');
            setSearching(true);
          }}
        >
          {t('branches.filter')}
        </button>
        <button onClick={() => onTools('worktree')}>
          {t('branchTree.worktree')}
          {state?.changed ? ` · ${state.changed}` : ''}
        </button>
        <button onClick={() => onTools('history')}>{t('branchTree.history')}</button>
        <button onClick={() => setRemote((value) => !value)}>
          {t(remote ? 'branchTree.hideRemote' : 'branchTree.showRemote')}
        </button>
        <button onClick={() => setExpanded((value) => !value)}>
          {t(expanded ? 'branchTree.collapse' : 'branchTree.expand')}
        </button>
        <button
          onClick={() => {
            setReload((value) => value + 1);
            void onRefresh().catch(setActionError);
          }}
        >
          {t('branches.refresh')}
        </button>
      </PopupMenu>
    </>
  );
  return (
    <div className="branch-tree-panel" ref={container}>
      {state?.operation && (
        <p className="branch-tree-status warning-text" role="status">
          {t('branches.operation', { operation: t(`branches.operations.${state.operation}`) })} ·{' '}
          {t('errors.branchOperation')}
        </p>
      )}
      {state?.files.some((file) => file.conflicted) && (
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
            <Button onClick={() => setReload((value) => value + 1)}>{t('repository.retry')}</Button>
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
            <Button onClick={() => onTools('worktree')}>{t('branchTree.worktree')}</Button>
          </div>
        ) : (
          <>
            <BranchTree
              data={data}
              selectedRef={selectedRef}
              comparison={result}
              expanded={expanded}
              onSelect={select}
              onCommit={onCommit}
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
                  if (event.key === 'Escape' && !event.defaultPrevented) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeDetails();
                  }
                }}
              >
                <header>
                  <span className="branch-tree-selection-icon" aria-hidden="true">
                    <GitBranch size={20} />
                  </span>
                  <div className="branch-tree-selection-heading">
                    <strong>{branch.name}</strong>
                    {((isCurrent && !loading) || branch.ref === data.baseRef) && (
                      <div className="branch-tree-selection-tags">
                        {isCurrent && !loading && (
                          <span className="branch-tree-current-tag">
                            <i aria-hidden="true" />
                            {t('branchTree.head')}
                          </span>
                        )}
                        {branch.ref === data.baseRef && <span>{t('branchTree.trunkLegend')}</span>}
                      </div>
                    )}
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
                <div className="branch-tree-selection-body">
                  {isCurrent && !loading ? (
                    <p className="branch-tree-checkout success-text">
                      {t('branchTree.current')}
                      {state?.changed
                        ? ` · ${t('branchTree.changed', { count: state.changed })}`
                        : ''}
                    </p>
                  ) : loading ? (
                    <p className="muted">{t('branchTree.refreshing')}</p>
                  ) : branch.inWorktree && !branch.current ? (
                    <p>{t('branchTree.occupied')}</p>
                  ) : branch.remote ? (
                    <p>{t('branchTree.remote')}</p>
                  ) : null}
                  {!branch.remote && (branch.upstream || isCurrent || branch.upstreamGone) && (
                    <p className={branch.upstreamGone ? 'warning-text' : 'muted'}>
                      {branch.upstreamGone
                        ? t('branchTree.upstreamGone')
                        : branch.upstream
                          ? t('branchTree.upstream', {
                              name: branch.upstream.replace(/^refs\/remotes\//, ''),
                            })
                          : t('branchTree.noUpstream')}
                      <HelpTip topic="upstream" />
                    </p>
                  )}
                  {branch.upstream && !branch.upstreamGone && (
                    <p className="branch-tree-sync">
                      <span>{t('repository.aheadCount', { value: branch.ahead ?? '—' })}</span>
                      <span>{t('repository.behindCount', { value: branch.behind ?? '—' })}</span>
                      <HelpTip topic="sync" />
                    </p>
                  )}
                  {comparing && (
                    <div className="branch-tree-comparison" role="status">
                      <p className="muted">
                        {t('branchTree.comparison', { name: trunkName })}
                        <HelpTip topic="treeComparison" />
                      </p>
                      {compareError ? (
                        <>
                          <p className="error-message" role="alert">
                            {formatError(compareError)}
                          </p>
                          <Button
                            size="compact"
                            onClick={() => {
                              setComparisonError(null);
                              setReload((value) => value + 1);
                            }}
                          >
                            {t('branches.refresh')}
                          </Button>
                        </>
                      ) : result ? (
                        <>
                          <strong>{t(`branchTree.relations.${result.relation}`)}</strong>
                          <div className="tree-comparison-counts">
                            <span className="success-text">
                              {t('branchTree.sourceOnly', { count: result.sourceOnly })}
                            </span>
                            <span>{t('branchTree.targetOnly', { count: result.targetOnly })}</span>
                          </div>
                        </>
                      ) : (
                        <p>{t('branchTree.comparing')}</p>
                      )}
                    </div>
                  )}
                  {!!actionError && (
                    <p className="error-message" role="alert">
                      {formatError(actionError)}
                    </p>
                  )}
                  <div className="branch-tree-actions">
                    <Tooltip detailed content={<GitHelp topic="treeComparison" />}>
                      <Button
                        size="compact"
                        icon={<GitCompareArrows size={15} />}
                        aria-pressed={comparing}
                        disabled={loading || !trunkHash}
                        onClick={() => setComparing((value) => !value)}
                      >
                        {t(comparing ? 'branchTree.stopCompare' : 'branchTree.compare')}
                      </Button>
                    </Tooltip>
                    {branch.remote ? (
                      <IconButton
                        label={t('branches.fromRemote', { name: branch.name })}
                        help={<GitHelp topic="tracking" />}
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
                            help={<GitHelp topic="switchBranch" />}
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
                            help={<GitHelp topic="deleteBranch" />}
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
                    <IconButton
                      label={t('branchTree.viewCommit', {
                        hash: branch.hash.slice(0, 7),
                        subject: branch.subject,
                      })}
                      help={<GitHelp topic="commitDiff" />}
                      onClick={() =>
                        onCommit({
                          hash: branch.hash,
                          shortHash: branch.hash.slice(0, 7),
                          parents: branch.parents,
                          author: branch.author,
                          subject: branch.subject,
                          date: branch.date,
                          refs: branch.ref,
                        })
                      }
                    >
                      <History size={16} />
                    </IconButton>
                  </div>
                  {isCurrent && (
                    <div className="branch-tree-actions branch-tree-sync-actions">
                      <HelpTip topic="sync" related={['fetch', 'pull', 'push']} />
                      <IconButton
                        label={t('repository.fetch')}
                        help={<GitHelp topic="fetch" />}
                        disabled={!!busy || loading || !state?.remotes.length}
                        onClick={() => void act({ type: 'fetch' })}
                      >
                        <RefreshCw size={15} />
                      </IconButton>
                      <IconButton
                        label={t('repository.pull')}
                        help={<GitHelp topic="pull" />}
                        disabled={!!busy || loading || !state?.upstream || state.detached}
                        onClick={() => void act({ type: 'pull' })}
                      >
                        <Download size={15} />
                      </IconButton>
                      <IconButton
                        label={t('repository.push')}
                        help={<GitHelp topic="push" />}
                        disabled={!!busy || loading || !state?.upstream || state.detached}
                        onClick={() => void act({ type: 'push' })}
                      >
                        <Upload size={15} />
                      </IconButton>
                    </div>
                  )}
                  {isCurrent && !loading && (
                    <Tooltip detailed content={<GitHelp topic="worktree" />}>
                      <Button
                        className="branch-tree-worktree-button"
                        size="compact"
                        variant="primary"
                        icon={<FileCode2 size={15} />}
                        onClick={() => onTools('worktree')}
                      >
                        {t('branchTree.worktree')}
                      </Button>
                    </Tooltip>
                  )}
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
              <button
                className="text-button"
                onClick={() => setLimit((value) => Math.min(600, value + 120))}
              >
                {t('branchTree.more')}
              </button>
            ) : (
              <span>{t('branchTree.limit')}</span>
            ))}
        </div>
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
          options={[
            ...(data.detached ? [{ ref: 'HEAD', name: t('branchTree.head') }] : []),
            ...(state?.branches || data.branches).map((item) => ({
              ref: `${item.remote ? 'refs/remotes/' : 'refs/heads/'}${item.name}`,
              name: item.name,
            })),
          ]}
          onApply={(ref) => {
            setBaseRef(ref);
            setComparing(false);
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
