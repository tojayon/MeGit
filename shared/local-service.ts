import type { ErrorInfo } from './messages.js';

export interface LocalServiceTarget {
  kind: 'npm' | 'powershell';
  directory: string;
  entry: string;
  port: number | null;
}

export interface LocalServiceConfig extends LocalServiceTarget {
  revision: string;
}

export type LocalServiceAction = 'start' | 'stop' | 'restart';

export interface ActiveLocalService {
  repoId: string;
  status: 'starting' | 'running' | 'stopping';
}

export interface LocalServiceCardState {
  repoId: string;
  revision: string | null;
  status: LocalServiceState['status'];
  error?: ErrorInfo;
}

export interface LocalServiceState {
  config: LocalServiceConfig | null;
  available: boolean;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
  error?: ErrorInfo;
  ownerPid?: number;
  log: string;
}
