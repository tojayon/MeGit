import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { GitDemoTooltip } from './GitDemoTooltip';
import type { LearningDemoOptions } from '../lib/git-learning-media';

export function Button({
  variant = 'default',
  size = 'default',
  busy,
  icon,
  className = '',
  disabled,
  children,
  type = 'button',
  learningDemo,
  learningPlayback,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  LearningDemoOptions & {
    variant?: 'default' | 'primary' | 'danger';
    size?: 'default' | 'compact';
    busy?: boolean;
    icon?: ReactNode;
  }) {
  const button = (
    <button
      {...props}
      type={type}
      className={`button ${variant === 'default' ? '' : variant} ${size === 'compact' ? 'compact' : ''} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || props['aria-busy'] || undefined}
    >
      {(icon || busy !== undefined) && (
        <span className="button-icon" aria-hidden="true">
          {busy ? <LoaderCircle size={16} className="spin" /> : icon}
        </span>
      )}
      <span className="button-label">{children}</span>
    </button>
  );
  return learningDemo ? (
    <GitDemoTooltip demo={learningDemo} playback={learningPlayback}>
      {button}
    </GitDemoTooltip>
  ) : (
    button
  );
}
