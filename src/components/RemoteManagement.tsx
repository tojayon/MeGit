import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, CircleAlert, CircleCheck, Cloud, CloudDownload, KeyRound, LoaderCircle, Plus, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { InfoPopover } from './InfoPopover';
import { Tooltip } from './Tooltip';

export function RemoteManagement({
  count,
  children,
  fetchHelp,
  fetching,
  fetchDisabled,
  addDisabled,
  onFetch,
  onAdd,
}: {
  count: number;
  children?: ReactNode;
  fetchHelp?: ReactNode;
  fetching?: boolean;
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
      <footer className="remote-management-footer">
        {fetchHelp ? <Tooltip content={fetchHelp} detailed>{fetchButton}</Tooltip> : fetchButton}
        <Button size="compact" variant="primary" icon={<Plus size={16} />} disabled={addDisabled} onClick={onAdd}>
          {t('remoteActions.addRemoteOpen')}
        </Button>
      </footer>
    </InfoPopover>
  );
}

type RemoteCardStatus = 'unchecked' | 'checking' | 'readable' | 'failed';

const statusIcons = { unchecked: Circle, checking: LoaderCircle, readable: CircleCheck, failed: CircleAlert };

export function RemoteManagementCard({
  name,
  status,
  error,
  disabled,
  onCheck,
  onLogin,
}: {
  name: string;
  status: RemoteCardStatus;
  error?: string;
  disabled?: boolean;
  onCheck: () => void;
  onLogin?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = statusIcons[status];
  const checking = status === 'checking';
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
      {status === 'readable' && <p className="remote-management-feedback">{t('remoteActions.pushNotChecked')}</p>}
      <div className="remote-management-card-actions">
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
