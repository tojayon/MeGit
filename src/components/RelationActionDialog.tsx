import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RelationAction, Repository, RepoState } from '../../shared/types';
import { api } from '../lib/api';
import { formatError, type NoticeMessage } from '../lib/messages';
import { useRepositoryActions } from '../lib/use-repository-actions';
import type { RelationShortcut } from '../lib/relation-actions';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { RelationActionIcon } from './RelationActionIcon';

export function RelationActionDialog({
  action, shortcut, repo, onRun, onClose, onState, onRefresh, onNotice,
}: {
  action: RelationAction;
  shortcut: RelationShortcut;
  repo: Repository;
  onRun: () => ReturnType<typeof api.relationAction>;
  onClose: () => void;
  onState: (state: RepoState) => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: NoticeMessage, error?: boolean) => void;
}) {
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const { busy, executeRelationAction } = useRepositoryActions({ repo, onState, onRefresh, onNotice });
  return (
    <RelationActionConfirmation
      shortcut={shortcut}
      disabled={!!busy || !!error}
      error={error ? formatError(error) : undefined}
      busy={submitting}
      onClose={onClose}
      onConfirm={async () => {
        setSubmitting(true);
        try {
          if (await executeRelationAction(action.type, onRun, shortcut.to)) onClose();
        } catch (failure) {
          setError(failure);
          await onRefresh();
        } finally {
          setSubmitting(false);
        }
      }}
    />
  );
}

export function RelationActionConfirmation({ shortcut, busy = false, disabled, error, onClose, onConfirm }: {
  shortcut: RelationShortcut;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { type } = shortcut;
  const title = t(`relation.sync.${type}`);
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <div className="dialog-body">
        <p className="relation-action-direction">{t('relation.sync.direction', shortcut)}</p>
        <p>{t(`relation.sync.${type}Help`)}</p>
        {error && <p role="alert" className="error-message">{error}</p>}
      </div>
      <footer className="dialog-footer">
        <Button onClick={onClose} disabled={busy} data-dialog-initial-focus="true">{t('common.cancel')}</Button>
        <Button
          variant={type === 'integrate' || shortcut.recommended ? 'primary' : 'default'}
          className="relation-sync-button"
          data-action={type}
          icon={<RelationActionIcon action={type} size={16} />}
          disabled={disabled}
          busy={busy}
          onClick={onConfirm}
        >
          {title}
        </Button>
      </footer>
    </Dialog>
  );
}
