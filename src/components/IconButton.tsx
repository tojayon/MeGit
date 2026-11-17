import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { GitDemoTooltip } from './GitDemoTooltip';
import type { LearningDemoOptions } from '../lib/git-learning-media';

export function IconButton({
  label,
  help,
  placement = 'bottom',
  size = 'default',
  variant = 'default',
  busy = false,
  className = '',
  disabled,
  children,
  type = 'button',
  learningDemo,
  learningPlayback,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> &
  LearningDemoOptions & {
    label: string;
    help?: ReactNode;
    placement?: 'top' | 'bottom' | 'right';
    size?: 'default' | 'small';
    variant?: 'default' | 'danger';
    busy?: boolean;
  }) {
  const button = (
    <button
      {...props}
      type={type}
      className={`icon-button ${size === 'small' ? 'small' : ''} ${variant === 'danger' ? 'danger' : ''} ${className}`}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : children}
    </button>
  );
  return learningDemo ? (
    <GitDemoTooltip demo={learningDemo} playback={learningPlayback} placement={placement}>
      {button}
    </GitDemoTooltip>
  ) : (
    <Tooltip content={help ?? label} detailed={help !== undefined} placement={placement}>
      {button}
    </Tooltip>
  );
}
