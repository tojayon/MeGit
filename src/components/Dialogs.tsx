import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, FolderGit2, GitMerge, GripHorizontal, Link2, X } from 'lucide-react';
import type { Board, FlowEdge, Repository } from '../../shared/types';
import { api } from '../lib/api';
import { formatError } from '../lib/messages';
import { isSafeRef } from '../../shared/refs';
import { RelationAppearance } from './RelationAppearance';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Field, focusFirstError } from './Field';
import { dismissPopups, focusWithoutTooltip, withoutFocusTooltip } from '../lib/overlays';
import { useDialogDrag } from '../lib/use-dialog-drag';
import { useScrollMemory } from '../lib/use-view-state';

const dialogOpeners = new WeakMap<HTMLDialogElement, HTMLElement | null>();

export function Dialog({
  title,
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
        <h2 id={titleId}>{title}</h2>
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
  onClose,
}: {
  existing: Repository[];
  onAdd: (repo: Repository) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog title={t('repository.addTitle')} onClose={onClose} busy={busy}>
      <form
        aria-busy={busy || undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          setBusy(true);
          setError('');
          try {
            const found = await api.inspect(path.trim());
            const known = existing.find((r) => r.path.toLowerCase() === found.path.toLowerCase());
            onAdd(
              known || {
                id: crypto.randomUUID(),
                path: found.path,
                name: name.trim() || found.name,
              },
            );
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
          <div className="dialog-symbol">
            <FolderGit2 size={25} />
          </div>
          <p className="muted">{t('repository.addHelp')}</p>
          <Field label={t('repository.path')} error={error ? formatError(error) : undefined}>
            <input
              autoFocus
              required
              value={path}
              disabled={busy}
              onChange={(e) => {
                setPath(e.target.value);
                setError(null);
              }}
              placeholder="D:\Projects\Develop\my-project"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label={t('repository.name')}>
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('repository.namePlaceholder')}
              maxLength={120}
            />
          </Field>
          {existing.length > 0 && (
            <div className="registered-repos">
              <span className="field-caption">{t('repository.registered')}</span>
              {existing.map((repo) => (
                <button
                  type="button"
                  key={repo.id}
                  className="repo-shortcut"
                  disabled={busy}
                  onClick={() => {
                    setPath(repo.path);
                    setName(repo.name);
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
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!path.trim()}
            icon={<FolderGit2 size={16} />}
          >
            {t('repository.addToBoard')}
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
  const [sourceRef, setSourceRef] = useState(initial?.sourceRef || 'HEAD');
  const [targetRef, setTargetRef] = useState(initial?.targetRef || 'HEAD');
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
    repo: repositories.find((r) => r.id === n.repoId)!,
  }));
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
          if (kind === 'integration' && ![sourceRef, targetRef].every(isSafeRef)) {
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
            sourceRef,
            targetRef,
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
                  setError(null);
                }}
              >
                {nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.repo.name}
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
                  setError(null);
                }}
              >
                {nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.repo.name}
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
                  error === 'invalidRef' && !isSafeRef(sourceRef)
                    ? t('relation.invalidRef')
                    : undefined
                }
              >
                <input
                  value={sourceRef}
                  onChange={(e) => {
                    setSourceRef(e.target.value);
                    setError(null);
                  }}
                  maxLength={240}
                  required
                  spellCheck={false}
                />
              </Field>
              <Field
                label={t('relation.targetRef')}
                error={
                  error === 'invalidRef' && !isSafeRef(targetRef)
                    ? t('relation.invalidRef')
                    : undefined
                }
              >
                <input
                  value={targetRef}
                  onChange={(e) => {
                    setTargetRef(e.target.value);
                    setError(null);
                  }}
                  maxLength={240}
                  required
                  spellCheck={false}
                />
              </Field>
            </div>
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
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
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
              maxLength={100}
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
