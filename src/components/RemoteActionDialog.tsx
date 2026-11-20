import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RemoteAction, RepoState } from '../../shared/types';
import { isBranchName } from '../../shared/refs';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { GitCommandPreview } from './GitCommandPreview';
import { actionArguments } from '../../shared/git-commands';

export function RemoteActionDialog({
  type,
  state,
  busy,
  onAction,
  onClose,
}: {
  type: RemoteAction['type'];
  state: RepoState;
  busy: boolean;
  onAction: (action: RemoteAction) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [source] = useState(state);
  const [name, setName] = useState(type === 'publishBranch' ? source.branch : '');
  const [destination, setDestination] = useState('');
  const [remote, setRemote] = useState(source.remotes.length === 1 ? source.remotes[0] : '');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const expected = { branch: source.branch, head: source.head, detached: source.detached };
  const targets = source.branches.filter((branch) => branch.remote);
  const selected = targets.find((branch) => branch.name === target);
  let action: RemoteAction | null = null;
  if (type === 'addRemote' && isBranchName(name) && !name.includes('/') && destination)
    action = { type, name, destination };
  if (type === 'publishBranch' && isBranchName(name) && source.remotes.includes(remote))
    action = { type, name, remote, expected };
  if (type === 'setTracking' && selected)
    action = { type, targetRef: `refs/remotes/${selected.name}`, targetHash: selected.hash, expected };
  const nameError = name && (!isBranchName(name) || (type === 'addRemote' && name.includes('/')))
    ? t(type === 'addRemote' ? 'errors.remoteName' : 'errors.branchName')
    : undefined;

  return (
    <Dialog title={t(`remoteActions.${type}`)} onClose={onClose} busy={pending}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy || submitting.current || !action) return;
        submitting.current = true;
        setPending(true);
        setError(null);
        try {
          if (await onAction(action)) onClose();
        } catch (err) {
          setError(err);
        } finally {
          submitting.current = false;
          setPending(false);
        }
      }}>
        <div className="dialog-body branch-dialog-body">
          {type !== 'addRemote' && (
            <dl className="branch-summary">
              <div><dt>{t('remoteActions.localBranch')}</dt><dd>{source.branch}</dd></div>
            </dl>
          )}
          <p className="muted">{t(`remoteActions.${type}Help`)}</p>
          {type === 'publishBranch' && (
            <Field label={t('remoteActions.remoteName')}>
              <select data-dialog-initial-focus="true" value={remote} disabled={pending} onChange={(event) => setRemote(event.target.value)}>
                <option value="" disabled>{t('remoteActions.chooseRemote')}</option>
                {source.remotes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
          )}
          {type !== 'setTracking' && (
            <Field label={t(type === 'addRemote' ? 'remoteActions.remoteName' : 'remoteActions.remoteBranch')} error={nameError}>
              <input data-dialog-initial-focus={type === 'addRemote' ? 'true' : undefined} value={name} maxLength={240} required disabled={pending} onChange={(event) => setName(event.target.value)} />
            </Field>
          )}
          {type === 'addRemote' && (
            <Field label={t('remoteActions.destination')}>
              <input value={destination} maxLength={4000} required disabled={pending} onChange={(event) => setDestination(event.target.value)} />
            </Field>
          )}
          {type === 'setTracking' && (
            <Field label={t('remoteActions.remoteBranch')} hint={!targets.length ? t('remoteActions.noTrackingTargets') : undefined}>
              <select data-dialog-initial-focus="true" value={target} disabled={pending || !targets.length} onChange={(event) => setTarget(event.target.value)}>
                <option value="" disabled>{t('remoteActions.chooseBranch')}</option>
                {targets.map((item) => <option key={item.name}>{item.name}</option>)}
              </select>
            </Field>
          )}
          {!!error && <p className="error-message" role="alert">{formatError(error)}</p>}
          <GitCommandPreview commands={action ? [actionArguments(action, source)] : []} when="confirm" />
        </div>
        <footer className="dialog-footer">
          <Button disabled={pending} onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" disabled={busy || pending || !action} busy={pending}>
            {t(`remoteActions.${type}`)}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
