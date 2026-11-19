import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { RepositoryAvatar } from './RepositoryAvatar';
import type { Board, FlowGroup, Repository, Snapshot } from '../../shared/types';
import { Dialog } from './Dialogs';
import { Button } from './Button';

export function GroupPanel({
  group,
  viewKey,
  board,
  repositories,
  snapshot,
  onClose,
  onEdit,
  onToggle,
  onRepo,
}: {
  group: FlowGroup;
  viewKey?: string;
  board: Board;
  repositories: Repository[];
  snapshot: Snapshot | null;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onRepo: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = t(group.collapsed ? 'group.expand' : 'group.collapse', { name: group.name });
  return (
    <Dialog viewKey={viewKey} title={group.name} closeLabel={t('group.close')} onClose={onClose}>
      <div className="dialog-body group-editor">
        <div className="group-panel-actions">
          <Button
            onClick={onToggle}
            icon={group.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          >
            {toggleLabel}
          </Button>
          <Button onClick={onEdit} icon={<Pencil size={15} />}>
            {t('group.edit')}
          </Button>
        </div>
        <div className="context-member-list">
          {group.nodeIds.map((id) => {
            const node = board.nodes.find((n) => n.id === id)!;
            const repo = repositories.find((r) => r.id === node.repoId)!;
            const state = snapshot?.repositories[repo.id];
            return (
              <button key={id} onClick={() => onRepo(repo.id)}>
                <RepositoryAvatar repo={repo} size="small" />
                <span>{repo.name}</span>
                <small
                  className={state?.error ? 'danger-text' : state?.changed ? 'warning-text' : ''}
                >
                  {state?.error
                    ? t('repository.unavailable')
                    : state
                      ? state.changed
                        ? t('repository.changes', { count: state.changed })
                        : t('repository.clean')
                      : t('common.loading')}
                </small>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
