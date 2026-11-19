import { ExternalLink, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RemoteDestination } from '../../shared/types';
import { InfoPopover } from './InfoPopover';
import { Tooltip } from './Tooltip';

export function RemoteDestinationButton({ destination }: { destination: RemoteDestination }) {
  const { t } = useTranslation();
  if (destination.kind === 'local') {
    return (
      <InfoPopover
        label={t('repository.localRemotePath')}
        triggerClassName="icon-button small"
        triggerContent={<FolderOpen size={15} aria-hidden="true" />}
      >
        <input
          className="remote-path-input"
          aria-label={t('repository.localRemotePath')}
          readOnly
          value={destination.value}
          onFocus={(event) => event.currentTarget.select()}
        />
      </InfoPopover>
    );
  }
  const label = t('repository.openRemoteBranch');
  return (
    <Tooltip content={label}>
      <a
        className="icon-button small"
        aria-label={label}
        href={destination.value}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={15} aria-hidden="true" />
      </a>
    </Tooltip>
  );
}
