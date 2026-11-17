import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import { Group } from 'lucide-react';
import type { Board, FlowGroup, Repository } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { Field, focusFirstError } from './Field';

export function GroupDialog({
  board,
  repositories,
  initial,
  initialMemberIds = [],
  onSave,
  onClose,
}: {
  board: Board;
  repositories: Repository[];
  initial?: FlowGroup;
  initialMemberIds?: string[];
  onSave: (group: FlowGroup) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || '');
  const [members, setMembers] = useState(initial?.nodeIds || initialMemberIds);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  return (
    <Dialog title={initial ? t('group.edit') : t('group.create')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!members.length) {
            setInvalid(true);
            focusFirstError(e.currentTarget);
            return;
          }
          if (!name.trim()) return;
          onSave({
            id: initial?.id || crypto.randomUUID(),
            name: name.trim(),
            nodeIds: members,
            collapsed: initial?.collapsed || false,
          });
          onClose();
        }}
      >
        <div className="dialog-body">
          <Field label={t('group.name')}>
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <fieldset
            className="group-members"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
          >
            <legend>{t('group.members')}</legend>
            {board.nodes.map((node) => {
              const repo = repositories.find((r) => r.id === node.repoId)!;
              const owner = board.groups?.find(
                (g) => g.id !== initial?.id && g.nodeIds.includes(node.id),
              );
              return (
                <label key={node.id} className="member-choice">
                  <input
                    type="checkbox"
                    checked={members.includes(node.id)}
                    aria-label={repo.name}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    onChange={(e) => {
                      setMembers((current) =>
                        e.target.checked
                          ? [...current, node.id]
                          : current.filter((id) => id !== node.id),
                      );
                      setInvalid(false);
                    }}
                  />
                  <RepositoryAvatar repo={repo} size="small" />
                  <span>
                    {repo.name}
                    {owner && <small>{t('group.moveFrom', { name: owner.name })}</small>}
                  </span>
                </label>
              );
            })}
            {invalid && (
              <p id={errorId} className="field-error" role="alert">
                {t('group.membersRequired')}
              </p>
            )}
          </fieldset>
        </div>
        <footer className="dialog-footer">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim()}
            icon={<Group size={16} />}
          >
            {t('group.save')}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
