import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Board } from '../../shared/types';
import { focusWithoutTooltip } from '../lib/overlays';
import { DesktopWindowControls } from './DesktopWindow';
import { IconButton } from './IconButton';
import { InfoPopover } from './InfoPopover';

export const workflowTabId = (prefix: string, id: string) =>
  `${prefix}-tab-${encodeURIComponent(id)}`;
export const workflowPanelId = (prefix: string, id: string) =>
  `${prefix}-panel-${encodeURIComponent(id)}`;

export function WorkflowHeader({
  boards,
  activeId,
  id,
  onSelect,
  onClose,
  desktop = false,
}: {
  boards: Board[];
  activeId?: string;
  id: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  desktop?: boolean;
}) {
  const { t } = useTranslation();
  const strip = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = strip.current;
    const tab = activeId && document.getElementById(workflowTabId(id, activeId))?.parentElement;
    if (!scroller || !tab) return;
    const view = scroller.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    if (item.left < view.left) scroller.scrollLeft += item.left - view.left;
    else if (item.right > view.right) scroller.scrollLeft += item.right - view.right;
  }, [id, activeId, boards.length]);

  function handleKey(event: KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      onClose(boards[index].id);
      return;
    }
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? boards.length - 1
          : event.key === 'ArrowLeft'
            ? (index + boards.length - 1) % boards.length
            : event.key === 'ArrowRight'
              ? (index + 1) % boards.length
              : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(boards[next].id);
    const tab = document.getElementById(workflowTabId(id, boards[next].id));
    if (strip.current?.contains(tab)) focusWithoutTooltip(tab);
  }

  return (
    <header className="workflow-header">
      {!!boards.length && (
        <div className="workflow-tabs" role="tablist" aria-label={t('board.tabs')} ref={strip}>
          {boards.map((board, index) => {
            const active = board.id === activeId;
            return (
              <div className="workflow-tab" key={board.id} role="presentation" data-active={active}>
                <InfoPopover
                  label={t('board.information')}
                  triggerLabel={t('board.tabInformation', { name: board.name })}
                >
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
                <button
                  type="button"
                  className="workflow-tab-trigger"
                  role="tab"
                  id={workflowTabId(id, board.id)}
                  aria-controls={workflowPanelId(id, board.id)}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelect(board.id)}
                  onKeyDown={(event) => handleKey(event, index)}
                >
                  {board.name}
                </button>
                <IconButton
                  label={t('board.tabClose', { name: board.name })}
                  onClick={() => onClose(board.id)}
                >
                  <X size={16} aria-hidden="true" />
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
      {desktop && <DesktopWindowControls />}
    </header>
  );
}
