import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Columns3,
  Rows3,
  Download,
  Focus,
  Group,
  Hand,
  LockKeyhole,
  Magnet,
  MousePointer2,
  Pencil,
  Redo2,
  StickyNote,
  Workflow,
  Undo2,
  Trash2,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import type { Arrangement } from '../lib/whiteboard';
import { Tooltip } from './Tooltip';
import { PopupMenu } from './PopupMenu';
import { IconButton } from './IconButton';

function CanvasMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <PopupMenu
      label={label}
      icon={icon}
      className="canvas-menu"
      triggerClassName="canvas-tool"
      menuClassName="canvas-menu-items"
    >
      {children}
    </PopupMenu>
  );
}

export function CanvasTools({
  tool,
  onTool,
  locked,
  onLock,
  snappingEnabled,
  onSnapping,
  canUndo,
  canRedo,
  onHistory,
  onNote,
  onStep,
  count,
  onEdit,
  editLabel,
  onRemove,
  selectionActions,
  unitCount,
  canGroup,
  onGroup,
  onArrange,
  onFocus,
  focused,
  onExitFocus,
  onExport,
  exporting,
  exportError,
  hasNodes,
}: {
  tool: 'select' | 'pan';
  onTool: (tool: 'select' | 'pan') => void;
  locked: boolean;
  onLock: () => void;
  snappingEnabled: boolean;
  onSnapping: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onHistory: (direction: 'undo' | 'redo') => void;
  onNote: () => void;
  onStep: () => void;
  count: number;
  onEdit?: () => void;
  editLabel: string;
  onRemove: () => void;
  selectionActions?: ReactNode;
  unitCount: number;
  canGroup: boolean;
  onGroup: () => void;
  onArrange: (kind: Arrangement) => void;
  onFocus: (context: boolean) => void;
  focused: boolean;
  onExitFocus: () => void;
  onExport: (format: 'svg' | 'png') => void;
  exporting: boolean;
  exportError: boolean;
  hasNodes: boolean;
}) {
  const { t } = useTranslation();
  const arrangements = [
    ['left', AlignStartVertical],
    ['center', AlignCenterVertical],
    ['right', AlignEndVertical],
    ['top', AlignStartHorizontal],
    ['middle', AlignCenterHorizontal],
    ['bottom', AlignEndHorizontal],
    ['horizontal', Columns3],
    ['vertical', Rows3],
  ] as const;
  return (
    <div className="canvas-editbar">
      <div className="canvas-tools" role="group" aria-label={t('tools.label')}>
        <Tooltip content={t('tools.selectHelp')}>
          <button
            className="canvas-tool"
            aria-label={t('tools.select')}
            aria-pressed={tool === 'select'}
            onClick={() => onTool('select')}
          >
            <MousePointer2 size={17} />
          </button>
        </Tooltip>
        <Tooltip content={t('tools.pan')}>
          <button
            className="canvas-tool"
            aria-label={t('tools.pan')}
            aria-pressed={tool === 'pan'}
            onClick={() => onTool('pan')}
          >
            <Hand size={17} />
          </button>
        </Tooltip>
        <i />
        <Tooltip content={t('tools.undoHelp')}>
          <button
            className="canvas-tool"
            aria-label={t('tools.undo')}
            disabled={!canUndo || locked}
            onClick={() => onHistory('undo')}
          >
            <Undo2 size={17} />
          </button>
        </Tooltip>
        <Tooltip content={t('tools.redoHelp')}>
          <button
            className="canvas-tool"
            aria-label={t('tools.redo')}
            disabled={!canRedo || locked}
            onClick={() => onHistory('redo')}
          >
            <Redo2 size={17} />
          </button>
        </Tooltip>
        <i />
        <Tooltip content={t('note.add')}>
          <button className="canvas-tool" aria-label={t('note.add')} onClick={onNote}>
            <StickyNote size={17} />
          </button>
        </Tooltip>
        <IconButton label={t('flowchart.add')} onClick={onStep} className="canvas-tool">
          <Workflow size={17} />
        </IconButton>
        <Tooltip content={t(locked ? 'tools.unlockLayout' : 'tools.lockLayout')}>
          <button
            className="canvas-tool"
            aria-label={t(locked ? 'tools.unlockLayout' : 'tools.lockLayout')}
            aria-pressed={locked}
            onClick={onLock}
          >
            {locked ? <LockKeyhole size={17} /> : <UnlockKeyhole size={17} />}
          </button>
        </Tooltip>
        <Tooltip content={t(snappingEnabled ? 'tools.snappingOn' : 'tools.snappingOff')}>
          <button
            className="canvas-tool"
            aria-label={t('tools.snapping')}
            aria-pressed={snappingEnabled}
            onClick={onSnapping}
          >
            <Magnet size={17} />
          </button>
        </Tooltip>
        <CanvasMenu label={t('tools.export')} icon={<Download size={17} />}>
          <p>{t('tools.exportHelp')}</p>
          {(['svg', 'png'] as const).map((format) => (
            <button key={format} disabled={!hasNodes || exporting} onClick={() => onExport(format)}>
              {t(format === 'svg' ? 'tools.exportSvg' : 'tools.exportPng')}
            </button>
          ))}
        </CanvasMenu>
      </div>
      {(locked || focused || exporting || exportError) && (
        <div className="canvas-state" role={exportError ? 'alert' : 'status'}>
          {locked && (
            <Tooltip content={t('tools.layoutHelp')}>
              <span>
                <LockKeyhole size={13} />
                {t('tools.layoutLocked')}
              </span>
            </Tooltip>
          )}
          {focused && (
            <button onClick={onExitFocus} aria-label={t('tools.exitFocus')}>
              <Focus size={14} />
              {t('tools.focused')}
              <X size={13} />
            </button>
          )}
          {exporting && <span>{t('tools.exporting')}</span>}
          {exportError && <span className="danger-text">{t('tools.exportFailed')}</span>}
        </div>
      )}
      {count > 0 && (
        <div
          className="canvas-tools canvas-selection-tools"
          role="group"
          aria-label={t('tools.selectionActions')}
        >
          <span className="selection-count">{t('tools.selection', { count })}</span>
          {unitCount > 1 && (
            <CanvasMenu label={t('tools.arrange')} icon={<AlignStartVertical size={17} />}>
              {arrangements.map(([kind, Icon]) => (
                <button
                  key={kind}
                  disabled={locked || (['horizontal', 'vertical'].includes(kind) && unitCount < 3)}
                  onClick={() => onArrange(kind)}
                >
                  <Icon size={16} />
                  {t(`tools.${kind}`)}
                </button>
              ))}
            </CanvasMenu>
          )}
          {canGroup && (
            <Tooltip content={t('tools.groupSelection')}>
              <button
                className="canvas-tool"
                aria-label={t('tools.groupSelection')}
                onClick={onGroup}
              >
                <Group size={17} />
              </button>
            </Tooltip>
          )}
          {unitCount > 0 && (
            <>
              <Tooltip content={t('tools.focusSelection')}>
                <button
                  className="canvas-tool"
                  aria-label={t('tools.focusSelection')}
                  onClick={() => onFocus(false)}
                >
                  <Focus size={17} />
                </button>
              </Tooltip>
              <Tooltip content={t('tools.focusContext')}>
                <button
                  className="canvas-tool"
                  aria-label={t('tools.focusContext')}
                  onClick={() => onFocus(true)}
                >
                  <Columns3 size={17} />
                </button>
              </Tooltip>
            </>
          )}
          {onEdit && (
            <IconButton className="canvas-tool" label={editLabel} onClick={onEdit}>
              <Pencil size={17} />
            </IconButton>
          )}
          {selectionActions}
          <IconButton
            className="canvas-tool"
            variant="danger"
            label={t('tools.removeSelection')}
            aria-description={t('tools.removeHelp')}
            onClick={onRemove}
          >
            <Trash2 size={17} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
