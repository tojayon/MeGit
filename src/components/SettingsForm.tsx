import type { InputHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export function SettingsOption({
  label,
  help,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; help?: string }) {
  const option = (
    <label className="settings-option">
      <input {...input} type="checkbox" />
      <span>{label}</span>
    </label>
  );
  return help ? (
    <Tooltip content={help} className="settings-option-anchor">
      {option}
    </Tooltip>
  ) : (
    option
  );
}

export function SettingsActions({
  feedback,
  children,
}: {
  feedback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-footer">
      {feedback}
      <div className="settings-actions">{children}</div>
    </div>
  );
}
