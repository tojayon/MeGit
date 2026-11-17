import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import { ArrowRightLeft, Check, GitBranch, GitBranchPlus, Search, Trash2 } from 'lucide-react';
import type { Branch, BranchAction, RepoState, Repository } from '../../shared/types';
import { isBranchName } from '../../shared/refs';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Field } from './Field';
import { formatError } from '../lib/messages';
import { GitHelp, HelpTip } from './GitHelp';

export type BranchSelection =
  | { type: 'createBranch'; state: RepoState; startPoint: string }
  | { type: 'switchBranch' | 'deleteBranch'; state: RepoState; branch: Branch };

export function BranchDialog({
  repo,
  selection,
  busy,
  onAction,
  onRefresh,
  onClose,
}: {
  repo: Repository;
  selection: BranchSelection;
  busy: boolean;
  onAction: (action: BranchAction) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // The confirmation stays tied to the state the user opened, even across polling.
  const { state } = selection;
  const [name, setName] = useState(
    selection.type === 'createBranch' && selection.startPoint.startsWith('refs/remotes/')
      ? selection.startPoint.replace(/^refs\/remotes\/[^/]+\//, '')
      : '',
  );
  const [startPoint, setStartPoint] = useState(
    selection.type === 'createBranch' ? selection.startPoint : 'HEAD',
  );
  const [checkout, setCheckout] = useState(false);
  const [track, setTrack] = useState(startPoint.startsWith('refs/remotes/'));
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const creating = selection.type === 'createBranch';
  const title = creating
    ? t('branches.create')
    : selection.type === 'switchBranch'
      ? t('branches.switch')
      : t('branches.delete');
  const nameError =
    name && !isBranchName(name)
      ? 'branchName'
      : name && state.branches.some((b) => !b.remote && b.name.toLowerCase() === name.toLowerCase())
        ? 'branchExists'
        : null;
  const startHash =
    startPoint === 'HEAD'
      ? state.head
      : state.branches.find(
          (b) => `${b.remote ? 'refs/remotes/' : 'refs/heads/'}${b.name}` === startPoint,
        )?.hash;
  const working = pending || busy;
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={working}
      headerActions={
        <HelpTip
          topic={
            creating
              ? 'createBranch'
              : selection.type === 'switchBranch'
                ? 'switchBranch'
                : 'deleteBranch'
          }
          related={creating && startPoint.startsWith('refs/remotes/') ? ['tracking'] : []}
        />
      }
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (pendingRef.current || busy || (creating && (!name || nameError || !startHash)))
            return;
          const expected = { branch: state.branch, head: state.head, detached: state.detached };
          const action: BranchAction =
            selection.type === 'createBranch'
              ? {
                  type: 'createBranch',
                  name,
                  startPoint,
                  startHash: startHash!,
                  checkout,
                  track,
                  expected,
                }
              : {
                  type: selection.type,
                  name: selection.branch.name,
                  targetHash: selection.branch.hash,
                  expected,
                };
          pendingRef.current = true;
          setPending(true);
          setError(null);
          try {
            if (await onAction(action)) onClose();
          } catch (err) {
            setError(err);
          } finally {
            pendingRef.current = false;
            setPending(false);
          }
        }}
      >
        <div className="dialog-body branch-dialog-body">
          <dl className="branch-summary">
            <div>
              <dt>{t('branches.repository')}</dt>
              <dd className="repository-identity">
                <RepositoryAvatar repo={repo} size="small" />
                {repo.name}
              </dd>
            </div>
            {!creating && (
              <>
                <div>
                  <dt>{t('branches.target')}</dt>
                  <dd>{selection.branch.name}</dd>
                </div>
                <div>
                  <dt>{t('branches.commit')}</dt>
                  <dd>
                    <code>{selection.branch.hash}</code>
                  </dd>
                </div>
              </>
            )}
          </dl>
          {creating ? (
            <>
              <Field
                label={t('branches.name')}
                error={nameError ? t(`errors.${nameError}`) : undefined}
              >
                <input
                  autoFocus
                  required
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={240}
                  value={name}
                  disabled={working}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label={t('branches.startPoint')}>
                <select
                  value={startPoint}
                  disabled={working}
                  onChange={(event) => {
                    setStartPoint(event.target.value);
                    setTrack(event.target.value.startsWith('refs/remotes/'));
                  }}
                >
                  <option value="HEAD">
                    {t('branches.currentCommit')} · {state.head?.slice(0, 7)}
                  </option>
                  {[false, true].map((remote) => (
                    <optgroup
                      label={
                        remote ? t('repository.remoteBranches') : t('repository.localBranches')
                      }
                      key={String(remote)}
                    >
                      {state.branches
                        .filter((b) => b.remote === remote)
                        .map((b) => (
                          <option
                            key={b.name}
                            value={`${remote ? 'refs/remotes/' : 'refs/heads/'}${b.name}`}
                          >
                            {b.name} · {b.hash.slice(0, 7)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {startPoint.startsWith('refs/remotes/') && (
                <label className="branch-checkbox">
                  <input
                    type="checkbox"
                    checked={track}
                    disabled={working}
                    onChange={(event) => setTrack(event.target.checked)}
                  />
                  {t('branches.track')}
                </label>
              )}
              <label className="branch-checkbox">
                <input
                  type="checkbox"
                  checked={checkout}
                  disabled={working || !!state.changed}
                  onChange={(event) => setCheckout(event.target.checked)}
                />
                {t('branches.checkout')}
              </label>
              {!!state.changed && <p className="warning-text">{t('errors.dirtyBranch')}</p>}
            </>
          ) : (
            <p className="muted">
              {selection.type === 'switchBranch'
                ? t('branches.switchHelp')
                : t('branches.deleteHelp')}
            </p>
          )}
          {!!error && (
            <div className="branch-action-error">
              <p className="error-message" role="alert">
                {formatError(error)}
              </p>
              <button
                type="button"
                className="text-button"
                disabled={working}
                onClick={async () => {
                  if (pendingRef.current) return;
                  pendingRef.current = true;
                  setPending(true);
                  try {
                    await onRefresh();
                    onClose();
                  } catch (err) {
                    setError(err);
                  } finally {
                    pendingRef.current = false;
                    setPending(false);
                  }
                }}
              >
                {t('branches.refresh')}
              </button>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <Button
            data-dialog-initial-focus={selection.type === 'deleteBranch' || undefined}
            disabled={working}
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant={selection.type === 'deleteBranch' ? 'danger' : 'primary'}
            busy={working}
            icon={
              selection.type === 'deleteBranch' ? <Trash2 size={16} /> : <GitBranch size={16} />
            }
            disabled={creating && (!name || !!nameError || !startHash)}
          >
            {title}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

export function BranchesPanel({
  repo,
  state,
  busy,
  onAction,
  onRefresh,
}: {
  repo: Repository;
  state: RepoState;
  busy: boolean;
  onAction: (action: BranchAction) => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [selection, setSelection] = useState<BranchSelection | null>(null);
  const blocked = busy || !!state.operation || !state.head;
  return (
    <div className="branches-panel">
      <div className="branches-toolbar">
        <label className="branch-filter">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label={t('branches.filter')}
            placeholder={t('branches.filter')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <IconButton
          label={t('branches.new')}
          help={<GitHelp topic="createBranch" />}
          disabled={blocked}
          onClick={() => setSelection({ type: 'createBranch', state, startPoint: 'HEAD' })}
        >
          <GitBranchPlus size={18} />
        </IconButton>
      </div>
      {!state.head && <p className="branch-restriction muted">{t('errors.branchNoCommits')}</p>}
      {state.operation && (
        <div className="branch-restriction warning-text" role="status">
          <p>
            {t('branches.operation', { operation: t(`branches.operations.${state.operation}`) })}
          </p>
          <p>{t('errors.branchOperation')}</p>
        </div>
      )}
      {!!state.changed && (
        <p className="branch-restriction warning-text">{t('errors.dirtyBranch')}</p>
      )}
      {[false, true].map((remote) => {
        const branches = state.branches.filter(
          (b) => b.remote === remote && b.name.toLowerCase().includes(filter.toLowerCase()),
        );
        return (
          <section
            className="branch-group"
            key={String(remote)}
            aria-label={remote ? t('repository.remoteBranches') : t('repository.localBranches')}
          >
            <h3>
              {remote ? t('repository.remoteBranches') : t('repository.localBranches')}
              <HelpTip topic={remote ? 'remoteBranches' : 'localBranches'} />
            </h3>
            {branches.length ? (
              branches.map((branch) => (
                <div className={`branch-row ${branch.current ? 'current' : ''}`} key={branch.name}>
                  <GitBranch size={15} className="branch-symbol" />
                  <div className="branch-label">
                    <span>{branch.name}</span>
                    <small>
                      <code>{branch.hash.slice(0, 7)}</code>
                      {branch.current ? (
                        <span>
                          <Check size={12} />
                          {t('branches.current')}
                        </span>
                      ) : branch.inWorktree ? (
                        <span>{t('branches.occupied')}</span>
                      ) : null}
                    </small>
                  </div>
                  <div className="branch-row-actions">
                    {remote ? (
                      <IconButton
                        size="small"
                        label={t('branches.fromRemote', { name: branch.name })}
                        help={<GitHelp topic="tracking" />}
                        disabled={blocked}
                        onClick={() =>
                          setSelection({
                            type: 'createBranch',
                            state,
                            startPoint: `refs/remotes/${branch.name}`,
                          })
                        }
                      >
                        <GitBranchPlus size={16} />
                      </IconButton>
                    ) : (
                      !branch.current && (
                        <>
                          <IconButton
                            size="small"
                            label={t('branches.switchTo', { name: branch.name })}
                            help={<GitHelp topic="switchBranch" />}
                            disabled={blocked || !!state.changed || !!branch.inWorktree}
                            onClick={() => setSelection({ type: 'switchBranch', state, branch })}
                          >
                            <ArrowRightLeft size={15} />
                          </IconButton>
                          <IconButton
                            size="small"
                            variant="danger"
                            label={t('branches.deleteNamed', { name: branch.name })}
                            help={<GitHelp topic="deleteBranch" />}
                            disabled={blocked || !!branch.inWorktree}
                            onClick={() => setSelection({ type: 'deleteBranch', state, branch })}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </>
                      )
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="branch-empty">
                {filter
                  ? t('branches.noMatches')
                  : remote
                    ? t('branches.emptyRemote')
                    : t('branches.emptyLocal')}
              </p>
            )}
          </section>
        );
      })}
      {selection && (
        <BranchDialog
          repo={repo}
          selection={selection}
          busy={busy}
          onAction={onAction}
          onRefresh={onRefresh}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}
