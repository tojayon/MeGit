import { errorMessages, type ErrorCode, type ErrorInfo } from '../../shared/messages';
import type { GitAction } from '../../shared/types';
import { i18n } from '../i18n';

export class ApiError extends Error implements ErrorInfo {
  constructor(
    public code: ErrorCode,
    public details?: string,
  ) {
    super(errorMessages[code]);
  }
}
export function formatError(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const info = error as Partial<ErrorInfo>;
  const code = info.code && Object.hasOwn(errorMessages, info.code) ? info.code : 'unknown';
  const message = i18n.t(`errors.${code}`);
  const details = info.details;
  return details ? `${message}\n${details}` : message;
}
export type NoticeMessage =
  | { key: `actions.${GitAction['type']}`; values: { name: string; target: string } }
  | { key: 'board.duplicate' }
  | { key: 'relation.sync.integrated'; values: { target: string } }
  | Error
  | ErrorInfo;
export function formatNotice(message: NoticeMessage): string {
  if (!('key' in message)) return formatError(message);
  if (message.key === 'relation.sync.integrated') return i18n.t(message.key, message.values);
  return 'values' in message ? i18n.t(message.key, message.values) : i18n.t(message.key);
}
