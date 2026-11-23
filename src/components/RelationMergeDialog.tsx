import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge } from 'lucide-react';
import { cardRefLabel } from '../../shared/card-refs';
import { prepareMergeArguments } from '../../shared/git-commands';
import type { DiffResult, RelationMergeRequest, RelationMergeResult, RelationMergeSelection, RepoState } from '../../shared/types';
import { api } from '../lib/api';
import { formatError } from '../lib/messages';
import type { RelationShortcut } from '../lib/relation-actions';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { GitCommandPreview } from './GitCommandPreview';

type MergeView = Extract<RelationMergeResult, { phase: 'review' | 'pending' }>;

export function RelationMergePreview({ result }: { result: Extract<MergeView, { phase: 'review' }> }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  return (
    <>
      <div className="two-fields relation-merge-sides">
        {(['source', 'target'] as const).map((side) => {
          const commits = result[`${side}Commits`];
          const total = result[`${side}Total`];
          return (
            <section key={side}>
              <h3>{t(`relation.merge.${side}Only`)} <span className="muted">{number.format(total)}</span></h3>
              {commits.length ? (
                <ul>{commits.map(({ hash, subject }) => <li key={hash}><code title={hash}>{hash.slice(0, 7)}</code> {subject}</li>)}</ul>
              ) : <p className="muted">{t('relation.merge.noCommits')}</p>}
              {total > commits.length && <p className="muted">{t('relation.merge.more', { remaining: number.format(total - commits.length) })}</p>}
            </section>
          );
        })}
      </div>
      {result.diff ? (
        <details className="relation-merge-diff">
          <summary>{t('relation.merge.sourceDiff')}</summary>
          <p className="muted">{t('relation.merge.sourceDiffHelp')}</p>
          <MergeDiff diff={result.diff} name={t('relation.merge.sourceDiff')} />
        </details>
      ) : <p className="muted">{t('relation.merge.multipleBases')}</p>}
    </>
  );
}

function MergeDiff({ diff, name }: { diff: DiffResult; name?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {diff.text ? <pre className="relation-merge-patch" tabIndex={0} aria-label={name}>{diff.text}</pre> : <p className="muted">{t('relation.merge.noDiff')}</p>}
      {diff.truncated && <p role="status">{t('relation.merge.truncated')}</p>}
    </>
  );
}

export function RelationMergeDialog({ boardId, edgeId, selection, shortcut, onClose, onState, onRefresh }: {
  boardId: string;
  edgeId: string;
  selection: RelationMergeSelection;
  shortcut: RelationShortcut;
  onClose: () => void;
  onState: (state: RepoState) => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<MergeView>();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmAbort, setConfirmAbort] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api.relationMerge(boardId, edgeId, { ...selection, step: 'review' }, controller.signal).then((view) => {
      if (!controller.signal.aborted && (view.phase === 'review' || view.phase === 'pending')) setResult(view);
    }, (failure: unknown) => {
      if (!controller.signal.aborted) setError(failure);
    });
    return () => controller.abort();
  }, [boardId, edgeId, selection]);

  async function run(action: RelationMergeRequest) {
    setBusy(true);
    setError(null);
    try {
      const view = await api.relationMerge(boardId, edgeId, action);
      if ('state' in view) {
        onState(view.state);
        onClose();
      } else {
        setResult(view);
      }
    } catch (failure) {
      setError(failure);
    } finally {
      if (action.step !== 'review') void onRefresh();
      setConfirmAbort(false);
      setBusy(false);
    }
  }

  const pending = result?.phase === 'pending' ? result : undefined;
  const review = result?.phase === 'review' ? result : undefined;
  const abort = pending ? { ...selection, step: 'abort' as const, session: pending.session } : null;
  return (
    <Dialog title={t('relation.sync.merge')} titleIcon={<GitMerge size={18} />} onClose={onClose} wide busy={busy}>
      <div className="dialog-body relation-merge-body">
        <p className="relation-action-direction">{t('relation.sync.direction', shortcut)}</p>
        <p className="relation-merge-tips">
          <code title={pending?.sourceHead || selection.sourceHead}>{(pending?.sourceHead || selection.sourceHead).slice(0, 7)}</code>
          <span aria-hidden="true">→</span><code title={selection.targetHead}>{selection.targetHead.slice(0, 7)}</code>
        </p>
        {!result && !error && <p role="status">{t('common.loading')}</p>}
        {review && (
          <>
            <RelationMergePreview result={review} />
            <p>{t('relation.merge.prepareHelp')}</p>
            {review.blocked && <p role="status" className="error-message">{t(`errors.${review.blocked}`)}</p>}
            <details className="relation-merge-diff">
              <summary>{t('gitCommands.title')}</summary>
              <GitCommandPreview when="confirm" commands={[prepareMergeArguments(selection.sourceHead)]} />
            </details>
          </>
        )}
        {pending && (
          <>
            <p role="status">{t('relation.merge.pending', { branch: cardRefLabel(pending.sourceRef) })}</p>
            {pending.conflicts.length > 0 && (
              <section className="relation-merge-conflicts">
                <h3>{t('relation.merge.conflicts')}</h3>
                <ul>{pending.conflicts.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
                <p>{t('relation.merge.conflictHelp')}</p>
              </section>
            )}
            {!pending.ready && !pending.conflicts.length && <p role="status">{t('errors.relationMergeUnstaged')}</p>}
            <section className="relation-merge-diff">
              <h3>{t('relation.merge.staged')}</h3>
              <MergeDiff diff={pending.diff} name={t('relation.merge.staged')} />
            </section>
            {!confirmAbort && <Field label={t('relation.merge.message')}>
              <textarea rows={2} maxLength={10000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
            </Field>}
            {confirmAbort && <p role="alert" className="error-message">{t('relation.merge.abortHelp')}</p>}
          </>
        )}
        {error != null && <p role="alert" className="error-message">{formatError(error)}</p>}
      </div>
      <footer className="dialog-footer">
        <Button data-dialog-initial-focus="true" disabled={busy} onClick={confirmAbort ? () => setConfirmAbort(false) : onClose}>
          {t(confirmAbort ? 'common.cancel' : 'relation.merge.close')}
        </Button>
        {!confirmAbort && (pending || review?.blocked || error != null) && (
          <Button disabled={busy} onClick={() => void run({ ...selection, step: 'review' })}>{t('relation.merge.refresh')}</Button>
        )}
        {abort && <Button variant={confirmAbort ? 'danger' : 'default'} disabled={busy} onClick={() => confirmAbort ? void run(abort) : setConfirmAbort(true)}>
          {t(confirmAbort ? 'relation.merge.confirmAbort' : 'relation.merge.abort')}
        </Button>}
        {review && <Button variant="primary" busy={busy} disabled={!!review.blocked || !!error} onClick={() => void run({ ...selection, step: 'prepare' })}>
          {t('relation.merge.prepare')}
        </Button>}
        {pending && !confirmAbort && <Button variant="primary" busy={busy} disabled={!pending.ready || !message.trim() || !!error}
          onClick={() => void run({ ...selection, step: 'commit', session: pending.session, index: pending.index, message })}>
          {t('relation.merge.commit')}
        </Button>}
      </footer>
    </Dialog>
  );
}
