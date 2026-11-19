import { Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Board } from '../../shared/types';
import { InfoPopover } from './InfoPopover';
import { PanelHeader } from './PanelHeader';

export function WorkflowHeader({ board, onClose }: { board: Board; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <PanelHeader
      title={board.name}
      icon={<Workflow size={16} />}
      closeLabel={t('board.closePanel')}
      onClose={onClose}
      actions={
        <InfoPopover label={t('board.information')}>
          <dl className="repository-information">
            <div>
              <dt>{t('board.name')}</dt>
              <dd>{board.name}</dd>
            </div>
            <div>
              <dt>{t('inspector.description')}</dt>
              <dd className="workflow-description">
                {board.description || t('board.noDescription')}
              </dd>
            </div>
          </dl>
          <div className="board-summary workflow-information-summary">
            <span>{t('board.repositories', { count: board.nodes.length })}</span>
            <span>{t('board.relations', { count: board.edges.length })}</span>
            <span>{t('inspector.groups', { count: board.groups?.length || 0 })}</span>
            {!!board.connections?.length && (
              <span>{t('flowchart.connections', { count: board.connections.length })}</span>
            )}
          </div>
        </InfoPopover>
      }
    />
  );
}
