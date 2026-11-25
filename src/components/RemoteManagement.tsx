import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, CircleAlert, CircleCheck, Cloud, CloudDownload, KeyRound, LoaderCircle, Settings, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { InfoPopover } from './InfoPopover';
import { Tooltip } from './Tooltip';
import { RemoteActionButton } from './RemoteActionButton';

export function RemoteManagement({
  count,
  children,
  fetchHelp,
  fetching,
  fetchError,
  fetchDisabled,
  addDisabled,
  onFetch,
  onAdd,
}: {
  count: number;
  children?: ReactNode;
  fetchHelp?: ReactNode;
  fetching?: boolean;
  fetchError?: string;
  fetchDisabled?: boolean;
  addDisabled?: boolean;
  onFetch: () => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const label = t('repository.fetchAllRemotes');
  const fetchButton = (
    <Button
      size="compact"
      className="branch-detail-action"
      icon={<CloudDownload size={16} />}
      busy={fetching}
      disabled={fetchDisabled || !count}
      onClick={onFetch}
    >
      {label}
    </Button>
  );
  return (
    <InfoPopover
      label={t('repository.manageRemotes')}
      triggerClassName="icon-button small"
      triggerContent={<Cloud size={16} aria-hidden="true" />}
      panelClassName="remote-management"
      titleIcon={<Cloud className="remote-management-title-icon" size={19} aria-hidden="true" />}
      titleDetail={<span className="remote-management-count">{t('remoteActions.count', { count })}</span>}
    >
      {count ? (
        <ul className="remote-management-list" role="list" tabIndex={0}>
          {children}
        </ul>
      ) : (
        <div className="remote-management-empty">
          <Cloud size={24} aria-hidden="true" />
          <p>{t('repository.noRemotes')}</p>
        </div>
      )}
      {fetchError && <p className="remote-management-fetch-error error-message" role="alert">{fetchError}</p>}
      <footer className="remote-management-footer">
        {fetchHelp ? <Tooltip content={fetchHelp} detailed>{fetchButton}</Tooltip> : fetchButton}
        <RemoteActionButton type="addRemote" disabled={addDisabled} onClick={onAdd} />
      </footer>
    </InfoPopover>
  );
}

type RemoteCardStatus = 'unchecked' | 'checking' | 'readable' | 'failed';

export type RemoteCardFetch = {
  onFetch: () => void;
  help?: ReactNode;
  pending?: boolean;
  error?: string;
};

const statusIcons = { unchecked: Circle, checking: LoaderCircle, readable: CircleCheck, failed: CircleAlert };

export function RemoteManagementCard({
  name,
  status,
  error,
  disabled,
  fetch,
  onCheck,
  onLogin,
}: {
  name: string;
  status: RemoteCardStatus;
  error?: string;
  disabled?: boolean;
  fetch?: RemoteCardFetch;
  onCheck: () => void;
  onLogin?: () => void;
}) {
  const { t } = useTranslation();
  const settingsId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const Icon = statusIcons[status];
  const checking = status === 'checking';
  const fetchButton = fetch && (
    <Button
      size="compact"
      icon={<CloudDownload size={15} />}
      aria-label={t('remoteActions.fetchOne', { name })}
      disabled={disabled || checking}
      busy={fetch.pending}
      onClick={fetch.onFetch}
    >
      {t('repository.fetch')}
    </Button>
  );
  return (
    <li className="remote-management-card">
      <div className="remote-management-card-top">
        <span className="remote-management-card-icon"><Cloud size={17} aria-hidden="true" /></span>
        <h4>{name}</h4>
        <span className={`remote-management-status ${status}`} role="status">
          <Icon size={13} className={checking ? 'spin' : undefined} aria-hidden="true" />
          {t(`remoteActions.readStatus.${status}`)}
        </span>
      </div>
      {error && <p className="remote-management-feedback error-message" role="alert">{error}</p>}
      {fetch?.error && <p className="remote-management-feedback error-message" role="alert">{fetch.error}</p>}
      {status === 'readable' && <p className="remote-management-feedback">{t('remoteActions.pushNotChecked')}</p>}
      <div className="remote-management-card-actions">
        {fetchButton && (
          <Tooltip content={fetch?.help ?? t('remoteActions.fetchOneHelp', { name })} detailed={!!fetch?.help}>
            {fetchButton}
          </Tooltip>
        )}
        <IconButton
          size="small"
          className="remote-management-settings"
          label={t('remoteActions.settings', { name })}
          aria-controls={settingsId}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="remote-management-card-actions remote-management-card-settings" id={settingsId} hidden={!settingsOpen}>
        <Button size="compact" icon={<ShieldCheck size={15} />} disabled={disabled} busy={checking} onClick={onCheck}>
          {t('remoteActions.checkRead')}
        </Button>
        {onLogin && (
          <Button size="compact" className="branch-detail-action" icon={<KeyRound size={15} />} disabled={disabled || checking} onClick={onLogin}>
            {t('remoteActions.githubLoginOpen')}
          </Button>
        )}
      </div>
    </li>
  );
}
