import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialogs';

export function CommitMessageDialog({
  message,
  onMessage,
  disabled,
  onClose,
}: {
  message: string;
  onMessage: (value: string) => void;
  disabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('repository.message')} onClose={onClose} wide>
      <div className="dialog-body commit-expanded-editor">
        <textarea
          aria-label={t('repository.message')}
          placeholder={t('repository.messagePlaceholder')}
          value={message}
          maxLength={10000}
          disabled={disabled}
          onChange={(event) => onMessage(event.target.value)}
          rows={10}
          data-dialog-initial-focus="true"
        />
      </div>
    </Dialog>
  );
}
