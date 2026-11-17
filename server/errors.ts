import { errorMessages, type ErrorCode, type ErrorInfo } from '../shared/messages.js';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
    public details?: string,
  ) {
    super(errorMessages[code]);
  }
}

export function errorInfo(error: unknown): ErrorInfo {
  if (error instanceof AppError)
    return {
      code: error.code,
      ...(error.details ? { details: safeMessage(new Error(error.details)) } : {}),
    };
  if (error instanceof SyntaxError) return { code: 'invalidJson' };
  if ((error as { status?: number })?.status === 413) return { code: 'requestTooLarge' };
  return { code: 'unknown', details: safeMessage(error) };
}

export function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Operation failed';
  return message
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1***@')
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[redacted]')
    .slice(0, 1600);
}
