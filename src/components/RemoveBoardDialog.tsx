import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Dialog } from './Dialogs';

export function RemoveBoardDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('board.removeTitle')} onClose={onClose}>
      <div className="dialog-body confirmation-body">
        <p>
          <strong>{name}</strong>
        </p>
        <p>{t('board.removeImpact')}</p>
        <p className="muted">{t('board.removeKeep')}</p>
      </div>
      <footer className="dialog-footer">
        <Button data-dialog-initial-focus="true" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" icon={<Trash2 size={16} />} onClick={onConfirm}>
          {t('board.removeConfirm')}
        </Button>
      </footer>
    </Dialog>
  );
}
