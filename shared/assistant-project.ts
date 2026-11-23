import type { LocalServiceTarget } from './local-service.js';
import type { ErrorInfo } from './messages.js';

export interface ProjectPlan {
  id: string;
  summary: string;
  read: string[];
  files: { path: string; before: string | null; content: string }[];
  service?: LocalServiceTarget;
  serviceAvailable?: boolean;
  replacesService?: boolean;
}

export interface ProjectResult {
  written: string[];
  configured: boolean;
  error?: ErrorInfo;
}
