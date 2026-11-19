import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
  type SetStateAction,
  type Dispatch,
} from 'react';
import { createViewStorage, isScrollPosition } from './view-storage';

export const viewStorage = createViewStorage(() => window.sessionStorage);
export function useViewState<T>(
  key: string | undefined,
  initial: T | (() => T),
  valid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [fallback, setFallback] = useState(initial);
  const latest = useRef({ fallback, valid });
  useLayoutEffect(() => {
    latest.current = { fallback, valid };
  }, [fallback, valid]);
  const snapshot = useCallback(() => {
    const value = key ? viewStorage.read(key) : undefined;
    return valid(value) ? value : fallback;
  }, [key, valid, fallback]);
  const subscribe = useCallback(
    (listener: () => void) => (key ? viewStorage.subscribe(key, listener) : () => {}),
    [key],
  );
  const value = useSyncExternalStore(subscribe, snapshot);
  const set = useCallback(
    (update: SetStateAction<T>) => {
      if (!key) {
        setFallback(update);
        return;
      }
      const saved = viewStorage.read(key);
      const previous = latest.current.valid(saved) ? saved : latest.current.fallback;
      const next = typeof update === 'function' ? (update as (previous: T) => T)(previous) : update;
      viewStorage.write(key, next);
    },
    [key],
  );
  return [value, set];
}
export function useViewIssue() {
  return useSyncExternalStore(viewStorage.subscribeIssue, viewStorage.issue);
}

export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  key: string | undefined,
  ready = true,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !key || !ready) return;
    const saved = viewStorage.read(key);
    let frame = 0;
    let initialized = !isScrollPosition(saved);
    const apply = () => {
      if (isScrollPosition(saved)) element.scrollTo({ ...saved, behavior: 'instant' });
    };
    const visible = () => element.getClientRects().length > 0 && element.clientHeight > 0;
    if (visible()) apply();
    const restore = () => {
      // A restored Dialog can still be closed in the first layout/frame. Wait for showModal.
      if (!visible()) return;
      apply();
      initialized = true;
      observer.disconnect();
    };
    const observer = new ResizeObserver(() => {
      if (initialized) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    if (!initialized) observer.observe(element);
    frame = requestAnimationFrame(restore);
    const save = () => {
      if (initialized) viewStorage.write(key, { left: element.scrollLeft, top: element.scrollTop });
    };
    element.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('scroll', save);
      window.removeEventListener('pagehide', save);
    };
  }, [ref, key, ready]);
}
