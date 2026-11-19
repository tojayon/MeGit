import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GitAction, RepoState, Repository } from '../../shared/types';
import { api } from './api';
import { useViewState } from './use-view-state';
import { isText } from './view-storage';
import type { NoticeMessage } from './messages';

const running = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => listeners.forEach((listener) => listener());

export function useRepositoryActions({
  repo,
  viewKey,
  onState,
  onRefresh,
  onNotice,
}: {
  repo: Repository;
  viewKey?: string;
  onState: (state: RepoState) => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: NoticeMessage, error?: boolean) => void;
}) {
  const [message, setMessage] = useViewState(viewKey && `${viewKey}.draft`, '', isText);
  const identity = JSON.stringify([repo.id, repo.path]);
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => generation.current?.abort(), [identity, viewKey]);
  const busy = useSyncExternalStore(subscribe, () => running.get(identity) || '');
  async function generateCommit(): Promise<boolean> {
    if (running.has(identity)) return false;
    const controller = new AbortController();
    generation.current = controller;
    running.set(identity, 'aiCommit');
    emit();
    try {
      const result = await api.generateCommit(repo.id, controller.signal);
      if (controller.signal.aborted) return false;
      setMessage((current) => (current === message ? result.text : current));
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      throw error;
    } finally {
      if (generation.current === controller) generation.current = null;
      running.delete(identity);
      emit();
    }
  }
  async function executeAction(operation: GitAction): Promise<boolean> {
    if (running.has(identity)) return false;
    running.set(identity, operation.type);
    emit();
    try {
      const result = await api.action(repo.id, operation);
      onState(result.state);
      if (operation.type === 'commit') setMessage('');
      await onRefresh();
      onNotice({ key: `actions.${operation.type}`, values: { name: repo.name } });
      return true;
    } finally {
      running.delete(identity);
      emit();
    }
  }
  return { message, setMessage, busy, executeAction, generateCommit };
}
