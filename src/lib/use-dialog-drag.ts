import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { clampDialogOffset } from './dialog-position';
import { dismissTooltips } from './overlays';
import { useViewState } from './use-view-state';
import { isFiniteNumber } from './view-storage';

type Offset = { x: number; y: number };

export function useDialogDrag(
  ref: RefObject<HTMLDialogElement | null>,
  enabled: boolean,
  viewKey?: string,
) {
  const [offset, setOffset] = useViewState<Offset>(
    viewKey && `${viewKey}.offset`,
    { x: 0, y: 0 },
    (v): v is Offset =>
      !!v &&
      typeof v === 'object' &&
      'x' in v &&
      'y' in v &&
      isFiniteNumber(v.x) &&
      isFiniteNumber(v.y),
  );
  const currentOffset = useRef(offset);
  const renderedOffset = useRef(offset);
  const gesture = useRef<{ id: number; x: number; y: number; origin: Offset } | null>(null);
  useLayoutEffect(() => {
    renderedOffset.current = enabled ? offset : { x: 0, y: 0 };
  }, [enabled, offset]);
  const move = useCallback(
    (next: Offset) => {
      const dialog = ref.current;
      if (!dialog) return;
      dismissTooltips();
      const rect = dialog.getBoundingClientRect();
      const bounded = clampDialogOffset(
        next,
        {
          // Multiple pointer events may run before React commits the next
          // transform. Subtract only the offset actually rendered in this rect.
          left: rect.left - renderedOffset.current.x,
          top: rect.top - renderedOffset.current.y,
          width: rect.width,
          height: rect.height,
        },
        { width: window.innerWidth, height: window.innerHeight },
      );
      currentOffset.current = bounded;
      setOffset(bounded);
    },
    [ref, setOffset],
  );

  useEffect(() => {
    if (!enabled) return;
    const resize = () => {
      gesture.current = null;
      move(currentOffset.current);
    };
    const blur = () => {
      gesture.current = null;
    };
    window.addEventListener('resize', resize);
    window.addEventListener('blur', blur);
    const frame = requestAnimationFrame(resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', blur);
    };
  }, [enabled, move]);

  return {
    style: enabled ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || !event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('button,a,input,select') && !target.closest('.dialog-move')) return;
      event.preventDefault();
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: currentOffset.current,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (start?.id !== event.pointerId) return;
      move({
        x: start.origin.x + event.clientX - start.x,
        y: start.origin.y + event.clientY - start.y,
      });
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.id !== event.pointerId) return;
      gesture.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel() {
      gesture.current = null;
    },
    onLostPointerCapture() {
      gesture.current = null;
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (!direction && event.key !== 'Home') return;
      event.preventDefault();
      event.stopPropagation();
      const distance = event.shiftKey ? 40 : 16;
      move(
        direction
          ? {
              x: currentOffset.current.x + direction[0] * distance,
              y: currentOffset.current.y + direction[1] * distance,
            }
          : { x: 0, y: 0 },
      );
    },
    center() {
      move({ x: 0, y: 0 });
    },
  };
}
