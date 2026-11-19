import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from '../../shared/types';
import { api } from './api';
import { ApiError } from './messages';
import { BoardHistory } from './board-history';
import { viewStorage } from './use-view-state';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [canRetrySave, setCanRetrySave] = useState(false);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const current = useRef<Workspace | null>(null);
  const sequence = useRef(0);
  const persisted = useRef(0);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blocked = useRef(false);
  const history = useRef(new BoardHistory());

  const flush = useCallback(async () => {
    if (running.current || blocked.current || !current.current) return;
    running.current = true;
    try {
      while (persisted.current < sequence.current && current.current) {
        const version = sequence.current;
        const saved = await api.save(structuredClone(current.current));
        current.current = { ...current.current, revision: saved.revision };
        setWorkspace(current.current);
        persisted.current = version;
      }
      setSaveStatus('saved');
    } catch (err) {
      blocked.current = true;
      setSaveStatus('failed');
      setCanRetrySave(
        err instanceof ApiError && ['connection', 'saveFailed', 'unknown'].includes(err.code),
      );
      setError(err instanceof Error ? err : new ApiError('saveFailed'));
    } finally {
      running.current = false;
    }
  }, []);

  const retrySave = useCallback(() => {
    if (!blocked.current || !canRetrySave || running.current) return;
    blocked.current = false;
    setCanRetrySave(false);
    setError(null);
    setSaveStatus('saving');
    void flush();
  }, [canRetrySave, flush]);

  const enqueue = useCallback(
    (next: Workspace) => {
      setHistoryStatus({
        canUndo: history.current.canUndo(next.activeBoardId),
        canRedo: history.current.canRedo(next.activeBoardId),
      });
      current.current = next;
      setWorkspace(next);
      sequence.current++;
      setSaveStatus('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 350);
    },
    [flush],
  );

  const update = useCallback(
    (recipe: (draft: Workspace) => void) => {
      if (!current.current || blocked.current) return;
      const next = structuredClone(current.current);
      recipe(next);
      if (JSON.stringify(next) === JSON.stringify(current.current)) return;
      history.current.record(current.current, next);
      enqueue(next);
    },
    [enqueue],
  );

  const restore = useCallback(
    (direction: 'undo' | 'redo', id: string) => {
      if (
        !current.current ||
        blocked.current ||
        current.current.boards.find((b) => b.id === id)?.layoutLocked
      )
        return;
      const next = history.current[direction](current.current, id);
      if (next) enqueue(next);
    },
    [enqueue],
  );

  useEffect(() => {
    let disposed = false;
    api
      .workspace()
      .then((data) => {
        if (!disposed) {
          const selectedBoard = viewStorage.read('app.board');
          if (
            typeof selectedBoard === 'string' &&
            data.boards.some((board) => board.id === selectedBoard)
          )
            data.activeBoardId = selectedBoard;
          current.current = data;
          setWorkspace(data);
        }
      })
      .catch((err) => {
        if (!disposed) setError(err);
      });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (sequence.current > persisted.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', beforeUnload);
      clearTimeout(timer.current);
    };
  }, []);

  return {
    workspace,
    update,
    error,
    saveStatus,
    canRetrySave,
    retrySave,
    restore,
    canUndo: historyStatus.canUndo && saveStatus !== 'failed',
    canRedo: historyStatus.canRedo && saveStatus !== 'failed',
  };
}
