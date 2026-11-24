import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export function PanelHeader({
  title,
  icon,
  closeLabel,
  onClose,
  actions,
  iconAction,
  bottom = false,
}: {
  title: string;
  icon: ReactNode;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  iconAction?: { label: string; help?: ReactNode; onClick: () => void; disabled?: boolean };
  bottom?: boolean;
}) {
  const Container = bottom ? 'footer' : 'header';
  return (
    <Container className={`inspector-heading${bottom ? ' inspector-heading-bottom' : ''}`}>
      {iconAction ? (
        <IconButton className="repo-symbol repository-avatar-button" {...iconAction}>
          {icon}
        </IconButton>
      ) : (
        <div className="repo-symbol" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="panel-heading-title">
        {bottom ? (
          <Tooltip content={title} placement="top">
            <h2 tabIndex={0}>{title}</h2>
          </Tooltip>
        ) : (
          <h2>{title}</h2>
        )}
      </div>
      <div className="panel-heading-actions">
        {actions}
        <IconButton
          data-panel-close
          label={closeLabel}
          onClick={onClose}
          placement={bottom ? 'top' : 'bottom'}
        >
          <X size={18} />
        </IconButton>
      </div>
    </Container>
  );
}
