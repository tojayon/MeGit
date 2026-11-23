import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Check, FileDiff, FolderGit2, GitBranch, GitMerge, LoaderCircle, RefreshCw } from 'lucide-react';
import { cardRefLabel } from '../../shared/card-refs';
import { prepareMergeArguments } from '../../shared/git-commands';
import type { DiffResult, RelationMergeRequest, RelationMergeView, RelationMergeSelection, Repository, RepoState } from '../../shared/types';
import { api } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { GitCommandPreview } from './GitCommandPreview';
import { RepositoryAvatar } from './RepositoryAvatar';
import { RelationMergeAi } from './RelationMergeAi';

type MergeIdentity = { repo?: Repository; name: string; ref: string; head: string };

export function RelationMergeHeader({ source, target }: { source: MergeIdentity; target: MergeIdentity }) {
  const { t } = useTranslation();
  function identity(side: 'source' | 'target', item: MergeIdentity) {
    return (
      <div className="relation-merge-repo">
        <span className="relation-merge-role">{t(`relation.merge.${side}`)}</span>
        <div className="relation-merge-repo-main">
          {item.repo ? <RepositoryAvatar repo={item.repo} size="small" /> : <FolderGit2 size={18} aria-hidden="true" />}
          <strong title={item.name}>{item.name}</strong>
        </div>
        <div className="relation-merge-ref">
          <GitBranch size={14} aria-hidden="true" />
          <span title={item.ref}>{cardRefLabel(item.ref)}</span>
          <code title={item.head}>{item.head.slice(0, 7)}</code>
        </div>
      </div>
    );
  }
  return (
    <div className="relation-merge-repos">
      {identity('source', source)}
      <ArrowRight className="relation-merge-arrow" size={18} aria-hidden="true" />
      {identity('target', target)}
    </div>
  );
}

export function RelationMergePreview({ result }: { result: Omit<Extract<RelationMergeView, { phase: 'review' }>, 'reviewKey'> }) {
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
              <h3>{t(`relation.merge.${side}Only`)} <span className="relation-merge-count">{number.format(total)}</span></h3>
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
          <summary><FileDiff size={15} aria-hidden="true" />{t('relation.merge.sourceDiff')}</summary>
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
      {diff.text ? <pre className="relation-merge-patch" tabIndex={0} aria-label={name}>{diff.text.split('\n').map((line, index) => (
        <span key={index} className={line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'diff-meta' :
          line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('@@') ? 'diff-hunk' : undefined}>{line}{'\n'}</span>
      ))}</pre> : <p className="muted">{t('relation.merge.noDiff')}</p>}
      {diff.truncated && <p role="status">{t('relation.merge.truncated')}</p>}
    </>
  );
}

export function RelationMergeDialog({ boardId, edgeId, selection, sourceRepo, targetRepo, onClose, onState, onRefresh }: {
  boardId: string;
  edgeId: string;
  selection: RelationMergeSelection;
  sourceRepo?: Repository;
  targetRepo: Repository;
  onClose: () => void;
  onState: (state: RepoState) => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<RelationMergeView>();
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
      void onRefresh();
      setConfirmAbort(false);
      setBusy(false);
    }
  }

  const pending = result?.phase === 'pending' ? result : undefined;
  const review = result?.phase === 'review' ? result : undefined;
  const abort = pending ? { ...selection, step: 'abort' as const, session: pending.session } : null;
  return (
    <Dialog title={t('relation.sync.merge')} titleIcon={<GitMerge size={18} />} className="relation-merge-dialog" onClose={onClose} wide busy={busy}>
      <div className="dialog-body relation-merge-body" aria-busy={busy || undefined}>
        <RelationMergeHeader
          source={{ repo: sourceRepo, name: sourceRepo?.name || t('relation.merge.source'), ref: pending?.sourceRef || selection.sourceRef, head: pending?.sourceHead || selection.sourceHead }}
          target={{ repo: targetRepo, name: targetRepo.name, ref: selection.targetRef, head: selection.targetHead }}
        />
        {!result && !error && <div className="loading-region" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" />{t('common.loading')}</div>}
        {result && (
          <div className="relation-merge-phase" role="status" data-conflicts={!!pending?.conflicts.length}>
            {pending?.conflicts.length ? <AlertTriangle size={18} aria-hidden="true" /> : pending ? <Check size={18} aria-hidden="true" /> : <FileDiff size={18} aria-hidden="true" />}
            <div>
              <strong>{t(pending?.conflicts.length ? 'relation.merge.needsResolution' : pending ? 'relation.merge.prepared' : 'relation.merge.readOnly')}</strong>
              <p>{pending ? t('relation.merge.pending', { branch: cardRefLabel(pending.sourceRef) }) : t('relation.merge.prepareHelp')}</p>
            </div>
          </div>
        )}
        {review && (
          <>
            <RelationMergePreview result={review} />
            {review.blocked && <p role="status" className="error-message">{t(`errors.${review.blocked}`)}</p>}
            <details className="relation-merge-diff">
              <summary>{t('gitCommands.title')}</summary>
              <GitCommandPreview when="confirm" commands={[prepareMergeArguments(selection.sourceHead)]} />
            </details>
          </>
        )}
        {pending && (
          <>
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
            {confirmAbort && <p role="alert" className="error-message">{t('relation.merge.abortHelp')}</p>}
          </>
        )}
        {result && !confirmAbort && <RelationMergeAi key={result.reviewKey} disabled={busy}
          review={(signal) => api.reviewMergeWithAi(boardId, edgeId, selection, result.reviewKey, signal)} />}
        {pending && !confirmAbort && <Field label={t('relation.merge.message')}>
          <textarea rows={2} maxLength={10000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
        </Field>}
        {error != null && <p role="alert" className="error-message">{formatError(error)}</p>}
      </div>
      <footer className="dialog-footer">
        <Button data-dialog-initial-focus="true" disabled={busy} onClick={confirmAbort ? () => setConfirmAbort(false) : onClose}>
          {t(confirmAbort ? 'common.cancel' : 'relation.merge.close')}
        </Button>
        {!confirmAbort && (result || error != null) && (
          <Button icon={<RefreshCw size={15} />} disabled={busy} onClick={() => void run({ ...selection, step: 'review' })}>{t('relation.merge.refresh')}</Button>
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
