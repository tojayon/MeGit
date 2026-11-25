import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Pin } from 'lucide-react';
import {
  repositoryEditTargetSchema,
  repositoryShortcutSchema,
  textEditLimit,
  type RepositoryEditPreview,
  type RepositoryEditSnapshot,
  type RepositoryEditTarget,
  type RepositoryShortcut,
} from '../../shared/repository-files';
import type { Repository } from '../../shared/types';
import { api } from '../lib/api';
import { ApiError, formatError } from '../lib/messages';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { RepositoryFileTree } from './RepositoryFileTree';
import { RepositoryAvatar } from './RepositoryAvatar';

const RepositoryCodeEditor = lazy(() => import('./RepositoryCodeEditor'));

export function RepositoryFilesDialog({
  repo,
  startShortcut,
  onClose,
  onSaved,
  onShortcut,
}: {
  repo: Repository;
  startShortcut?: RepositoryShortcut;
  onClose: () => void;
  onSaved: () => void;
  onShortcut?: (shortcut?: RepositoryShortcut) => void;
}) {
  const { t } = useTranslation();
  const editorFormId = useId();
  const [files, setFiles] = useState<string[]>([]);
  const [listing, setListing] = useState(!startShortcut);
  const [listError, setListError] = useState<unknown>(null);
  const [filename, setFilename] = useState('');
  const [target, setTarget] = useState<RepositoryEditTarget | null>(startShortcut?.target ?? null);
  const [snapshot, setSnapshot] = useState<RepositoryEditSnapshot | null>(null);
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<RepositoryEditPreview | null>(null);
  const [busy, setBusy] = useState(!!startShortcut);
  const [error, setError] = useState<unknown>(null);
  const [configuring, setConfiguring] = useState(false);
  const [discard, setDiscard] = useState<'close' | 'reload' | { path: string } | null>(null);
  const pending = useRef(false);
  const changed = !!snapshot && value !== snapshot.value;
  const quick = target && target.kind !== 'text';
  const branch = snapshot?.branch || t('repository.detached');
  const targetPath = target?.kind === 'npm' ? 'package.json' : target?.path;
  const refreshNeeded =
    error instanceof ApiError &&
    ['repositoryEditChanged', 'repositoryEditWrite'].includes(error.code);

  useEffect(() => {
    const controller = new AbortController();
    const read = startShortcut
      ? api.readRepositoryEdit(repo.id, startShortcut.target, controller.signal).then((data) => {
          if (controller.signal.aborted) return;
          setSnapshot(data);
          setValue(data.value);
        })
      : api.repositoryFiles(repo.id, controller.signal).then((data) => {
          if (!controller.signal.aborted) setFiles(data);
        });
    void read
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (startShortcut) setError(reason);
        else setListError(reason);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        if (startShortcut) setBusy(false);
        else setListing(false);
      });
    return () => controller.abort();
  }, [repo.id, startShortcut]);

  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (reason) {
      setError(reason);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function load(selection: RepositoryEditTarget) {
    void run(async () => {
      const data = await api.readRepositoryEdit(repo.id, selection);
      setTarget(selection);
      setSnapshot(data);
      setValue(data.value);
      setPreview(null);
    });
  }

  function leave(action: NonNullable<typeof discard>) {
    if (busy) return;
    if (changed) setDiscard(action);
    else finish(action);
  }

  function finish(action: NonNullable<typeof discard>) {
    setDiscard(null);
    if (action === 'close') onClose();
    else if (action === 'reload' && target) load(target);
    else if (typeof action === 'object') load({ kind: 'text', path: action.path });
  }

  function openFile(path: string) {
    const parsed = repositoryEditTargetSchema.safeParse({ kind: 'text', path });
    if (!parsed.success) setError(new ApiError('repositoryEditPath'));
    else if (path !== targetPath || !snapshot) leave({ path });
  }

  function submit() {
    if (!snapshot || !target || busy) return;
    const edit = { target, revision: snapshot.revision, value };
    void run(async () => {
      if (preview) {
        await api.saveRepositoryEdit(repo.id, { ...edit, approval: preview.approval });
        onSaved();
        if (startShortcut) onClose();
        else {
          setPreview(null);
          setSnapshot(null);
          setValue('');
          const data = await api.readRepositoryEdit(repo.id, target);
          setSnapshot(data);
          setValue(data.value);
        }
      } else setPreview(await api.previewRepositoryEdit(repo.id, edit));
    });
  }

  return (
    <Dialog
      title={
        startShortcut
          ? startShortcut.label || t('repositoryFiles.version')
          : t('repositoryFiles.title')
      }
      headerLeading={
        !startShortcut && (
          <div className="repository-panel-identity" title={repo.name}>
            <RepositoryAvatar repo={repo} size="small" />
            <span className="repository-panel-name">{repo.name}</span>
          </div>
        )
      }
      titleDetail={startShortcut && <span className="muted">{repo.name}</span>}
      className={startShortcut ? 'repository-field-dialog' : 'repository-files-dialog'}
      wide={!startShortcut || !!preview}
      busy={busy}
      onClose={() => leave('close')}
      headerActions={
        !startShortcut &&
        onShortcut && (
          <IconButton
            label={t('repositoryFiles.configure')}
            onClick={() => setConfiguring(true)}
            disabled={busy}
          >
            <Pin size={17} />
          </IconButton>
        )
      }
    >
      <div className={startShortcut ? undefined : 'repository-file-layout'}>
        {!startShortcut && (
          <nav className="repository-file-tree" aria-label={t('repositoryFiles.tree')}>
            <h3>{t('repositoryFiles.tree')}</h3>
            <div className="repository-file-tree-scroll">
              {listing ? (
                <p className="muted" role="status">
                  {t('common.loading')}
                </p>
              ) : files.length ? (
                <RepositoryFileTree
                  files={files}
                  selected={targetPath}
                  busy={busy}
                  onOpen={openFile}
                />
              ) : !listError ? (
                <p className="muted">{t('repositoryFiles.emptyTree')}</p>
              ) : null}
              {!!listError && (
                <p className="error-message" role="alert">
                  {formatError(listError)}
                </p>
              )}
            </div>
            <details className="repository-file-manual">
              <summary>{t('repositoryFiles.openByPath')}</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  openFile(filename.trim());
                }}
              >
                <Field label={t('repositoryFiles.path')}>
                  <input
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    maxLength={400}
                    required
                    disabled={busy}
                  />
                </Field>
                <Button type="submit" size="compact" disabled={busy || !filename.trim()}>
                  {t('repositoryFiles.open')}
                </Button>
              </form>
            </details>
          </nav>
        )}
        <form
          id={editorFormId}
          className="repository-file-editor"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="dialog-body repository-files-body">
            {!target && (
              <p className="repository-file-empty muted">{t('repositoryFiles.chooseFile')}</p>
            )}
            {target && (
              <div className="repository-file-context">
                <code>
                  {targetPath}
                  {target.kind === 'json' && ` · ${target.pointer}`}
                </code>
                {snapshot && (
                  <span className="repository-file-branch">
                    <GitBranch size={14} aria-hidden="true" />
                    {branch}
                  </span>
                )}
              </div>
            )}
            {quick && snapshot && !preview && (
              <Field label={t('repositoryFiles.value')}>
                <input
                  className="repository-field-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  maxLength={textEditLimit}
                  spellCheck={false}
                  disabled={busy}
                />
              </Field>
            )}
            {target?.kind === 'text' && snapshot && (
              <div className="repository-code-area" hidden={!!preview}>
                <Suspense
                  fallback={
                    <p role="status" className="muted">
                      {t('common.loading')}
                    </p>
                  }
                >
                  <RepositoryCodeEditor
                    key={`${target.path}:${snapshot.revision}`}
                    path={target.path}
                    value={value}
                    disabled={busy}
                    onChange={setValue}
                  />
                </Suspense>
              </div>
            )}
            {preview && (
              <>
                <p className="muted">{t('repositoryFiles.saveScope')}</p>
                {preview.files.map(({ path, patch }) => (
                  <section
                    key={path}
                    className="repository-file-preview"
                    aria-label={t('repositoryFiles.diffNamed', { path })}
                  >
                    <h3>{path}</h3>
                    <div
                      className="diff-view"
                      tabIndex={0}
                      aria-label={t('repositoryFiles.diffNamed', { path })}
                    >
                      <pre>
                        {patch
                          .split('\n')
                          .slice(4)
                          .map((line, index) => (
                            <span
                              key={index}
                              className={
                                line.startsWith('+')
                                  ? 'diff-add'
                                  : line.startsWith('-')
                                    ? 'diff-remove'
                                    : line.startsWith('@')
                                      ? 'diff-hunk'
                                      : undefined
                              }
                            >
                              {line}
                              {'\n'}
                            </span>
                          ))}
                      </pre>
                    </div>
                  </section>
                ))}
              </>
            )}
            {busy && !snapshot && (
              <p className="muted" role="status">
                {t('common.loading')}
              </p>
            )}
            {!!error && (
              <p className="error-message" role="alert">
                {formatError(error)}
              </p>
            )}
          </div>
        </form>
      </div>
      <footer className="dialog-footer">
        <Button onClick={() => leave('close')} disabled={busy}>
          {t('common.cancel')}
        </Button>
        {target && (refreshNeeded || !snapshot) && (
          <Button onClick={() => leave('reload')} disabled={busy}>
            {t('repositoryFiles.reload')}
          </Button>
        )}
        {preview && (
          <Button onClick={() => setPreview(null)} disabled={busy}>
            {t('repositoryFiles.back')}
          </Button>
        )}
        <Button
          form={editorFormId}
          type="submit"
          variant="primary"
          busy={busy}
          disabled={!snapshot || !changed || refreshNeeded}
        >
          {t(preview ? 'common.save' : 'repositoryFiles.preview')}
        </Button>
      </footer>
      {configuring && onShortcut && (
        <ShortcutDialog
          repo={repo}
          initialFile={targetPath || filename}
          onClose={() => setConfiguring(false)}
          onSave={(shortcut) => {
            onShortcut(shortcut);
            setConfiguring(false);
          }}
        />
      )}
      {discard && (
        <Dialog title={t('repositoryFiles.discard')} onClose={() => setDiscard(null)}>
          <div className="dialog-body">
            <p>{t('repositoryFiles.discardHint')}</p>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setDiscard(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => finish(discard)}>
              {t('repositoryFiles.discard')}
            </Button>
          </footer>
        </Dialog>
      )}
    </Dialog>
  );
}

function ShortcutDialog({
  repo,
  initialFile,
  onClose,
  onSave,
}: {
  repo: Repository;
  initialFile: string;
  onClose: () => void;
  onSave: (shortcut?: RepositoryShortcut) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'npm' | 'json'>(repo.shortcut?.target.kind ?? 'npm');
  const [label, setLabel] = useState(repo.shortcut?.label ?? '');
  const [filename, setFilename] = useState(
    repo.shortcut?.target.kind === 'json' ? repo.shortcut.target.path : initialFile,
  );
  const [pointer, setPointer] = useState(
    repo.shortcut?.target.kind === 'json' ? repo.shortcut.target.pointer : '/version',
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    const parsed = repositoryShortcutSchema.safeParse({
      label: label.trim() || undefined,
      target: kind === 'npm' ? { kind } : { kind, path: filename.trim(), pointer },
    });
    if (!parsed.success) {
      setError(new ApiError('repositoryEditField'));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.readRepositoryEdit(repo.id, parsed.data.target);
      onSave(parsed.data);
    } catch (reason) {
      setError(reason);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title={t('repositoryFiles.configure')} onClose={onClose} busy={busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="dialog-body">
          <Field label={t('repositoryFiles.kind')}>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value === 'json' ? 'json' : 'npm')}
              disabled={busy}
            >
              <option value="npm">{t('repositoryFiles.npm')}</option>
              <option value="json">{t('repositoryFiles.json')}</option>
            </select>
          </Field>
          <Field label={t('repositoryFiles.label')}>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={kind === 'npm' ? t('repositoryFiles.version') : undefined}
              required={kind === 'json'}
              maxLength={40}
              disabled={busy}
            />
          </Field>
          {kind === 'json' && (
            <>
              <Field label={t('repositoryFiles.path')}>
                <input
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  required
                  maxLength={400}
                  disabled={busy}
                />
              </Field>
              <Field label={t('repositoryFiles.pointer')} hint={t('repositoryFiles.pointerHint')}>
                <input
                  value={pointer}
                  onChange={(event) => setPointer(event.target.value)}
                  required
                  maxLength={400}
                  disabled={busy}
                />
              </Field>
            </>
          )}
          {!!error && (
            <p className="error-message" role="alert">
              {formatError(error)}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          {repo.shortcut && (
            <Button onClick={() => onSave(undefined)} disabled={busy}>
              {t('repositoryFiles.unpin')}
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t('common.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
