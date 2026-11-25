import { useTranslation } from 'react-i18next';
import type { Snapshot } from '../../shared/types';
import type { RepositoryShortcut } from '../../shared/repository-files';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

export function RepositoryShortcutControl({
  shortcut,
  field,
  onOpen,
}: {
  shortcut: RepositoryShortcut;
  field?: NonNullable<Snapshot['repositoryFields']>[string];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const value = field && 'value' in field ? field.value : undefined;
  const error = field && 'error' in field ? formatError(field.error) : '';
  const label = shortcut.label || t('repositoryFiles.version');
  const content =
    value === undefined
      ? label
      : t('repositoryFiles.shortcutValue', { label, value: value || t('repositoryFiles.empty') });
  return (
    <div className="repository-shortcut nodrag nopan" onClick={(event) => event.stopPropagation()}>
      <Tooltip content={error || t('repositoryFiles.editShortcut', { name: content })}>
        <Button
          size="compact"
          className="repository-shortcut-button"
          aria-label={t('repositoryFiles.editShortcut', { name: content })}
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          {content}
        </Button>
      </Tooltip>
      {error && (
        <span className="repository-card-notice danger-text" role="status">
          {t('repositoryFiles.unavailable')}
        </span>
      )}
    </div>
  );
}
