import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LocalServiceAction,
  LocalServiceCardState,
  LocalServiceState,
} from '../../shared/local-service';
import { request } from './api';

type Snapshot = { boardId: string; cards: LocalServiceCardState[]; problem: unknown };
const noCards: LocalServiceCardState[] = [];

export function useLocalServiceCards(boardId: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [pending, setPending] = useState<Map<string, LocalServiceAction>>(() => new Map());
  const operations = useRef(new Map<string, LocalServiceAction>());
  const version = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const reading = version.current;
      const current = () => !controller.signal.aborted && reading === version.current;
      try {
        if (document.hidden || operations.current.size) return;
        const cards = await request<LocalServiceCardState[]>(
          `/local-services?${new URLSearchParams({ boardId })}`,
          { signal: controller.signal },
        );
        if (current()) {
          setSnapshot((previous) =>
            previous?.boardId === boardId &&
            !previous.problem &&
            JSON.stringify(previous.cards) === JSON.stringify(cards)
              ? previous
              : { boardId, cards, problem: null },
          );
        }
      } catch (problem) {
        if (current())
          setSnapshot((previous) =>
            previous?.boardId === boardId
              ? { ...previous, problem }
              : { boardId, cards: noCards, problem },
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [boardId, enabled]);

  const execute = useCallback(
    async (repoId: string, action: LocalServiceAction, revision: string) => {
      if (operations.current.has(repoId)) return;
      operations.current.set(repoId, action);
      version.current++;
      setPending(new Map(operations.current));
      try {
        const next = await request<LocalServiceState>(
          `/repositories/${encodeURIComponent(repoId)}/local-service`,
          {
            method: 'POST',
            body: JSON.stringify({ action, revision }),
          },
        );
        setSnapshot((previous) =>
          previous?.boardId === boardId
            ? {
                ...previous,
                cards: previous.cards.map((card) =>
                  card.repoId === repoId
                    ? {
                        repoId,
                        revision: next.config?.revision ?? null,
                        status: next.status,
                        error: next.error,
                      }
                    : card,
                ),
              }
            : previous,
        );
      } finally {
        operations.current.delete(repoId);
        version.current++;
        setPending(new Map(operations.current));
      }
    },
    [boardId],
  );

  const current = enabled && snapshot?.boardId === boardId ? snapshot : undefined;
  return { cards: current?.cards ?? noCards, problem: current?.problem, pending, execute };
}
