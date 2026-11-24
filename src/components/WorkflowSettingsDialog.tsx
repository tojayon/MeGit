import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Trash2 } from 'lucide-react';
import type { Board } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Field } from './Field';
import { Button } from './Button';
import { RemoveBoardDialog } from './RemoveBoardDialog';

export function WorkflowSettingsDialog({
  board,
  viewKey,
  onSave,
  onGroup,
  onRemove,
  removeDisabled,
  onClose,
}: {
  board: Board;
  viewKey?: string;
  onSave: (details: Pick<Board, 'name' | 'description'>) => void;
  onGroup?: (id: string) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [nameDraft, setName] = useState({ base: board.name, value: board.name });
  const [descriptionDraft, setDescription] = useState({
    base: board.description,
    value: board.description,
  });
  if (nameDraft.base !== board.name) setName({ base: board.name, value: board.name });
  if (descriptionDraft.base !== board.description)
    setDescription({ base: board.description, value: board.description });
  const name = nameDraft.base === board.name ? nameDraft.value : board.name;
  const description =
    descriptionDraft.base === board.description ? descriptionDraft.value : board.description;
  return (
    <Dialog viewKey={viewKey} title={t('board.settings')} onClose={onClose}>
      <div className="dialog-body">
        <div className="board-summary">
          <span>{t('board.repositories', { count: board.nodes.length })}</span>
          <span>{t('board.relations', { count: board.edges.length })}</span>
          <span>{t('inspector.groups', { count: board.groups?.length || 0 })}</span>
          {!!board.connections?.length && (
            <span>{t('flowchart.connections', { count: board.connections.length })}</span>
          )}
        </div>
        <form
          id={formId}
          className="inspector-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave({ name: name.trim(), description });
          }}
        >
          <Field label={t('board.name')}>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName({ base: board.name, value: e.target.value })}
            />
          </Field>
          <Field label={t('inspector.description')}>
            <textarea
              rows={5}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription({ base: board.description, value: e.target.value })}
            />
          </Field>
        </form>
        {onGroup && !!board.groups?.length && (
          <div className="context-member-list">
            {board.groups.map((group) => (
              <button key={group.id} onClick={() => onGroup(group.id)}>
                <Group size={16} />
                <span>{group.name}</span>
                <small>{group.nodeIds.length}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className="dialog-footer workflow-settings-actions">
        {onRemove && (
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            disabled={removeDisabled}
            onClick={() => setConfirmRemove(true)}
          >
            {t('board.removeConfirm')}
          </Button>
        )}
        <Button
          form={formId}
          type="submit"
          variant="primary"
          disabled={
            !name.trim() || (name.trim() === board.name && description === board.description)
          }
        >
          {t('common.save')}
        </Button>
      </footer>
      {confirmRemove && onRemove && (
        <RemoveBoardDialog
          name={board.name}
          disabled={removeDisabled}
          onClose={() => setConfirmRemove(false)}
          onConfirm={onRemove}
        />
      )}
    </Dialog>
  );
}
