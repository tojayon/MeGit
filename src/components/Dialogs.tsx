import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, FolderGit2, GitMerge, GripHorizontal, Link2, X } from 'lucide-react';
import type { Board, FlowEdge, Repository } from '../../shared/types';
import { api, request } from '../lib/api';
import { formatError } from '../lib/messages';
import { isSafeRef } from '../../shared/refs';
import { RelationAppearance } from './RelationAppearance';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Field, focusFirstError } from './Field';
import { cardRefLabel } from '../../shared/card-refs';
import { dismissPopups, focusWithoutTooltip, withoutFocusTooltip } from '../lib/overlays';
import { useDialogDrag } from '../lib/use-dialog-drag';
import { useScrollMemory } from '../lib/use-view-state';

const dialogOpeners = new WeakMap<HTMLDialogElement, HTMLElement | null>();

export function Dialog({
  title,
  titleIcon,
  titleDetail,
  children,
  onClose,
  wide = false,
  busy = false,
  closeLabel,
  headerActions,
  className = '',
  draggable = false,
  persistent = false,
  viewKey,
  restoreReady = true,
}: {
  title: string;
  titleIcon?: ReactNode;
  titleDetail?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
  closeLabel?: string;
  headerActions?: ReactNode;
  className?: string;
  draggable?: boolean;
  persistent?: boolean;
  viewKey?: string;
  restoreReady?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useDialogDrag(ref, draggable, viewKey);
  useScrollMemory(ref, viewKey && `${viewKey}.scroll`, restoreReady);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dismissPopups();
    withoutFocusTooltip(() => {
      // On reload a nested difference window mounts with its parent. Open ancestors first
      // so the parent cannot cover the child when its own effect runs later.
      const chain: HTMLDialogElement[] = [dialog];
      let ancestor = dialog.parentElement?.closest('dialog');
      while (ancestor) {
        chain.push(ancestor);
        ancestor = ancestor.parentElement?.closest('dialog') ?? null;
      }
      for (const item of chain.reverse()) {
        if (item.open) continue;
        dialogOpeners.set(item, document.activeElement as HTMLElement | null);
        item.showModal();
        item.querySelector<HTMLElement>('[data-dialog-initial-focus="true"]')?.focus();
      }
    });
    const prior = dialogOpeners.get(dialog);
    return () => {
      dialogOpeners.delete(dialog);
      withoutFocusTooltip(() => dialog.close());
      if (prior?.isConnected) focusWithoutTooltip(prior);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog ${wide ? 'wide' : ''} ${draggable ? 'is-draggable' : ''} ${className}`}
      style={drag.style}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy && !persistent) onClose();
      }}
      onClick={(event) => {
        if (!busy && !persistent && event.target === ref.current) onClose();
      }}
    >
      <header
        className="dialog-header"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        onDoubleClick={(event) => {
          if (draggable && !(event.target as HTMLElement).closest('button,a')) drag.center();
        }}
      >
        {draggable && (
          <IconButton
            className="dialog-move"
            label={t('common.moveWindow')}
            onKeyDown={drag.onKeyDown}
            onClick={(event) => {
              if (event.detail === 0) drag.center();
            }}
          >
            <GripHorizontal size={18} />
          </IconButton>
        )}
        {titleIcon || titleDetail ? (
          <div className="dialog-title-context">
            <h2 id={titleId}>{title}</h2>
            {titleIcon}
            {titleDetail}
          </div>
        ) : (
          <h2 id={titleId}>{title}</h2>
        )}
        <div className="dialog-header-actions">
          {headerActions}
          <IconButton
            label={closeLabel || t('common.close', { name: title })}
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </div>
      </header>
      {children}
    </dialog>
  );
}

export function AddRepositoryDialog({
  existing,
  onAdd,
  onChooseCard,
  onClose,
  mode = 'board',
  repo,
  onArchive,
  onRemove,
}: {
  existing: Repository[];
  onAdd: (repo: Repository) => void;
  onChooseCard?: (
    repo: Repository,
    state: Awaited<ReturnType<typeof api.inspect>>['state'],
    displayName?: string,
  ) => void;
  onClose: () => void;
  mode?: 'board' | 'register' | 'edit';
  repo?: Repository;
  onArchive?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState(repo?.path ?? '');
  const [name, setName] = useState(repo?.name ?? '');
  const [logo, setLogo] = useState(repo?.logoPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      title={
        repo
          ? t('repositoryIndex.edit', { name: repo.name })
          : t(mode === 'register' ? 'repositoryIndex.register' : 'repository.addTitle')
      }
      onClose={onClose}
      busy={busy}
    >
      <form
        aria-busy={busy || undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          setBusy(true);
          setError('');
          try {
            if (repo) {
              onAdd({ ...repo, name: name.trim(), logoPath: logo });
              onClose();
              return;
            }
            const found = await api.inspect(path.trim());
            const known = existing.find((r) => r.path.toLowerCase() === found.path.toLowerCase());
            if (known?.archived) {
              setError({ code: 'repositoryArchived' });
              return;
            }
            const repository = known || {
              id: crypto.randomUUID(),
              path: found.path,
              name: (mode === 'board' ? '' : name.trim()) || found.name,
            };
            const displayName = name.trim();
            if (onChooseCard) {
              onChooseCard(repository, found.state, displayName || undefined);
            } else onAdd(repository);
            onClose();
          } catch (err) {
            setError(err);
            focusFirstError(form);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          {repo ? (
            <div className="repository-index-identity">
              <RepositoryAvatar repo={{ ...repo, logoPath: logo }} size="preview" />
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const choice = await request<{ path: string | null }>(
                      `/repositories/${encodeURIComponent(repo.id)}/pick-image`,
                      { method: 'POST' },
                    );
                    if (choice.path) setLogo(choice.path);
                  } catch (failure) {
                    setError(failure);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('repositoryIndex.pickAvatar')}
              </Button>
              <Button disabled={busy || !logo} onClick={() => setLogo(undefined)}>
                {t('repositoryAvatar.reset')}
              </Button>
            </div>
          ) : (
            <div className="dialog-symbol">
              <FolderGit2 size={25} />
            </div>
          )}
          {!repo && (
            <p className="muted">
              {t(mode === 'register' ? 'repositoryIndex.registerHelp' : 'repository.addHelp')}
            </p>
          )}
          <Field label={t('repository.path')} error={error ? formatError(error) : undefined}>
            <input
              autoFocus
              required
              value={path}
              disabled={busy}
              readOnly={Boolean(repo)}
              onChange={(e) => {
                setPath(e.target.value);
                setError(null);
              }}
              placeholder="D:\Projects\Develop\my-project"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {!repo && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const choice = await request<{ path: string | null }>('/local-picker/folder', {
                    method: 'POST',
                  });
                  if (choice.path) setPath(choice.path);
                } catch (failure) {
                  setError(failure);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('repositoryIndex.pickFolder')}
            </Button>
          )}
          <Field label={t(mode === 'board' ? 'repositoryCard.displayName' : 'repository.name')}>
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                mode === 'board' ? 'repositoryCard.namePlaceholder' : 'repository.namePlaceholder',
              )}
              maxLength={120}
            />
          </Field>
          {mode === 'board' && existing.some((item) => !item.archived) && (
            <div className="registered-repos">
              <span className="field-caption">{t('repository.registered')}</span>
              {existing
                .filter((item) => !item.archived)
                .map((repo) => (
                  <button
                    type="button"
                    key={repo.id}
                    className="repo-shortcut"
                    disabled={busy}
                    onClick={() => {
                      setPath(repo.path);
                      setError(null);
                    }}
                  >
                    <RepositoryAvatar repo={repo} size="small" />
                    {repo.name}
                    <ArrowRight size={14} />
                  </button>
                ))}
            </div>
          )}
          {repo && (
            <div className="repository-index-actions">
              <Button disabled={busy} onClick={onArchive}>
                {t(repo.archived ? 'repositoryIndex.restore' : 'repositoryIndex.archive')}
              </Button>
              <Button disabled={busy} variant="danger" onClick={onRemove}>
                {t('repositoryIndex.remove')}
              </Button>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!path.trim() || (Boolean(repo) && !name.trim())}
            icon={<FolderGit2 size={16} />}
          >
            {t(
              repo
                ? 'common.save'
                : mode === 'register'
                  ? 'repositoryIndex.register'
                  : 'repository.addToBoard',
            )}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

export function RelationDialog({
  board,
  repositories,
  initial,
  onSave,
  onClose,
}: {
  board: Board;
  repositories: Repository[];
  initial?: Partial<FlowEdge>;
  onSave: (edge: FlowEdge) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState(initial?.source || board.nodes[0]?.id || '');
  const [target, setTarget] = useState(initial?.target || board.nodes[1]?.id || '');
  const [kind, setKind] = useState<FlowEdge['kind']>(initial?.kind || 'integration');
  const [label, setLabel] = useState(initial?.label || '');
  const [sourceRef, setSourceRef] = useState(initial?.sourceRef ?? '');
  const [targetRef, setTargetRef] = useState(initial?.targetRef ?? '');
  const [localIntegration, setLocalIntegration] = useState(!!initial?.localIntegration);
  const [appearance, setAppearance] = useState<
    Pick<FlowEdge, 'routing' | 'sourcePort' | 'targetPort'>
  >({
    routing: initial?.routing || 'smoothstep',
    sourcePort: initial?.sourcePort || 'right',
    targetPort: initial?.targetPort || 'left',
  });
  const [error, setError] = useState<'different' | 'duplicate' | 'invalidRef' | null>(null);
  const nodes = board.nodes.map((n) => ({
    ...n,
    name: n.displayName || repositories.find((r) => r.id === n.repoId)!.name,
  }));
  const distinctRepositories = nodes.find((node) => node.id === source)?.repoId !==
    nodes.find((node) => node.id === target)?.repoId;
  const canEnableLocalIntegration = kind === 'integration' && distinctRepositories &&
    [sourceRef || nodes.find((node) => node.id === source)?.ref || 'HEAD',
      targetRef || nodes.find((node) => node.id === target)?.ref || 'HEAD']
      .every((ref) => ref === 'HEAD' || ref.startsWith('refs/heads/'));
  return (
    <Dialog
      title={initial?.id ? t('relation.editTitle') : t('relation.createTitle')}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (source === target) {
            setError('different');
            focusFirstError(event.currentTarget);
            return;
          }
          if (
            board.edges.some(
              (e) =>
                e.id !== initial?.id &&
                e.source === source &&
                e.target === target &&
                e.kind === kind,
            )
          ) {
            setError('duplicate');
            focusFirstError(event.currentTarget);
            return;
          }
          if (
            kind === 'integration' &&
            ![sourceRef, targetRef].every((ref) => !ref || isSafeRef(ref))
          ) {
            setError('invalidRef');
            focusFirstError(event.currentTarget);
            return;
          }
          onSave({
            ...appearance,
            waypoints:
              source === initial?.source && target === initial?.target
                ? initial?.waypoints
                : undefined,
            id: initial?.id || crypto.randomUUID(),
            source,
            target,
            kind,
            label: label.trim(),
            sourceRef: sourceRef || undefined,
            targetRef: targetRef || undefined,
            localIntegration: canEnableLocalIntegration && localIntegration ? true : undefined,
          });
          onClose();
        }}
      >
        <div className="dialog-body">
          <div className="relation-fields">
            <Field label={t('relation.sourceRepo')}>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setLocalIntegration(false);
                  setError(null);
                }}
              >
                {nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.ref ? `${n.name} · ${cardRefLabel(n.ref)}` : n.name}
                  </option>
                ))}
              </select>
            </Field>
            <ArrowRight size={18} />
            <Field
              label={t('relation.targetRepo')}
              error={error && error !== 'invalidRef' ? t(`relation.${error}`) : undefined}
            >
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setLocalIntegration(false);
                  setError(null);
                }}
              >
                {nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.ref ? `${n.name} · ${cardRefLabel(n.ref)}` : n.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('relation.kind')}>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as FlowEdge['kind']);
                setError(null);
              }}
            >
              <option value="integration">{t('relation.integration')}</option>
              <option value="dependency">{t('relation.dependency')}</option>
              <option value="delivery">{t('relation.delivery')}</option>
            </select>
          </Field>
          <div className="relation-explanation">
            {kind === 'integration' ? (
              <>
                <GitMerge size={17} />
                <p>{t('relation.integrationHelp')}</p>
              </>
            ) : (
              <>
                <Link2 size={17} />
                <p>
                  {kind === 'dependency'
                    ? t('relation.dependencyHelp')
                    : t('relation.deliveryHelp')}
                </p>
              </>
            )}
          </div>
          <Field label={t('relation.name')}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t(`relation.${kind}`)}
              maxLength={100}
            />
          </Field>
          {kind === 'integration' && (
            <div className="two-fields">
              <Field
                label={t('relation.sourceRef')}
                error={
                  error === 'invalidRef' && sourceRef && !isSafeRef(sourceRef)
                    ? t('relation.invalidRef')
                    : undefined
                }
              >
                <input
                  value={sourceRef}
                  placeholder={t('relation.inheritCardRef')}
                  onChange={(e) => {
                    setSourceRef(e.target.value);
                    setLocalIntegration(false);
                    setError(null);
                  }}
                  maxLength={240}
                  spellCheck={false}
                />
              </Field>
              <Field
                label={t('relation.targetRef')}
                error={
                  error === 'invalidRef' && targetRef && !isSafeRef(targetRef)
                    ? t('relation.invalidRef')
                    : undefined
                }
              >
                <input
                  value={targetRef}
                  placeholder={t('relation.inheritCardRef')}
                  onChange={(e) => {
                    setTargetRef(e.target.value);
                    setLocalIntegration(false);
                    setError(null);
                  }}
                  maxLength={240}
                  spellCheck={false}
                />
              </Field>
            </div>
          )}
          {canEnableLocalIntegration && (
            <label className="relation-local-integration">
              <input type="checkbox" checked={localIntegration} onChange={(event) => setLocalIntegration(event.target.checked)} />
              <span>{t('relation.sync.enableLocal')}</span>
            </label>
          )}
          <RelationAppearance
            edge={appearance}
            onChange={(change) => setAppearance((current) => ({ ...current, ...change }))}
          />
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!source || !target}
            icon={<Link2 size={16} />}
          >
            {t('relation.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

export function TextDialog({
  title,
  label,
  initial = '',
  maxLength = 100,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  maxLength?: number;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text.trim());
          onClose();
        }}
      >
        <div className="dialog-body">
          <Field label={label}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              maxLength={maxLength}
            />
          </Field>
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            {t('common.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
