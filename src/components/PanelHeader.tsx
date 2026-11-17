import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export function PanelHeader({
  title,
  icon,
  closeLabel,
  onClose,
  actions,
  iconAction,
}: {
  title: string;
  icon: ReactNode;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  iconAction?: { label: string; help?: ReactNode; onClick: () => void; disabled?: boolean };
}) {
  return (
    <header className="inspector-heading">
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
        <h2>{title}</h2>
      </div>
      <div className="panel-heading-actions">
        {actions}
        <IconButton data-panel-close label={closeLabel} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </header>
  );
}
