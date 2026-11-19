import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RemoteReadStatus } from '../../shared/types';
import { api } from '../lib/api';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { RemoteManagementCard } from './RemoteManagement';

export function RemoteAccessRow({ repoId, name, disabled, onLogin }: {
  repoId: string;
  name: string;
  disabled: boolean;
  onLogin: () => void;
}) {
  const { t } = useTranslation();
  const [githubLogin, setGitHubLogin] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<RemoteReadStatus>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const abort = new AbortController();
    void api.remoteAccessOptions(repoId, name, abort.signal)
      .then((options) => { if (!abort.signal.aborted) setGitHubLogin(options.githubLogin); })
      .catch((failure: unknown) => { if (!abort.signal.aborted) setError(failure); });
    return () => abort.abort();
  }, [repoId, name]);

  async function check() {
    setChecking(true);
    setError(undefined);
    try {
      setStatus((await api.checkRemoteRead(repoId, name)).status);
    } catch (failure) {
      setError(failure);
    } finally {
      setChecking(false);
    }
  }

  const failure = checking ? undefined : error ? formatError(error)
    : status && status !== 'readable' ? t(`errors.${status}`) : undefined;

  return (
    <RemoteManagementCard
      name={name}
      status={checking ? 'checking' : failure ? 'failed' : status === 'readable' ? 'readable' : 'unchecked'}
      error={failure}
      disabled={disabled}
      onCheck={() => void check()}
      onLogin={githubLogin ? onLogin : undefined}
    />
  );
}

export function RemoteGitHubLogin({ repoId, name, onClose }: {
  repoId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<unknown>();

  async function login() {
    setPending(true);
    setError(undefined);
    try {
      await api.loginRemoteGitHub(repoId, name);
      setCompleted(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title={t('remoteActions.githubLogin')} busy={pending} onClose={onClose}>
      <div className="dialog-body">
        <p><strong>{name}</strong></p>
        {completed ? <p role="status">{t('remoteActions.githubCompleted')}</p>
          : <p>{t('remoteActions.githubHelp')}</p>}
        {pending && <p role="status">{t('remoteActions.githubWaiting')}</p>}
        {!!error && <p role="alert">{formatError(error)}</p>}
      </div>
      <footer className="dialog-footer">
        <Button data-dialog-initial-focus="true" onClick={onClose} disabled={pending}>
          {t(completed ? 'remoteActions.githubDone' : 'common.cancel')}
        </Button>
        {!completed && <Button variant="primary" busy={pending} onClick={() => void login()}>
          {t('remoteActions.githubAuthorize')}
        </Button>}
      </footer>
    </Dialog>
  );
}
