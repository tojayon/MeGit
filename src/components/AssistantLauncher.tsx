import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { AssistantAvatar } from './AssistantAvatar';
import { useTranslation } from 'react-i18next';
import { useViewState } from '../lib/use-view-state';
import { Tooltip } from './Tooltip';

type Position = { edge: 'left' | 'right'; ratio: number };
const valid = (value: unknown): value is Position =>
  !!value &&
  typeof value === 'object' &&
  'edge' in value &&
  (value.edge === 'left' || value.edge === 'right') &&
  'ratio' in value &&
  typeof value.ratio === 'number' &&
  Number.isFinite(value.ratio) &&
  value.ratio >= 0 &&
  value.ratio <= 1;
const size = 56;
export function AssistantLauncher({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const [position, setPosition] = useViewState<Position>(
    'assistant.launcher',
    { edge: 'right', ratio: 0.72 },
    valid,
  );
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    top: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const suppress = useRef(false);
  const extent = Math.min(size, viewport.width, viewport.height);
  const point = drag || {
    x: position.edge === 'left' ? 0 : viewport.width - extent,
    y: position.ratio * (viewport.height - extent),
  };
  useEffect(() => {
    const update = () => {
      gesture.current = null;
      setDrag(null);
      setViewport({ width: innerWidth, height: innerHeight });
    };
    window.addEventListener('resize', update);
    window.addEventListener('blur', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('blur', update);
    };
  }, []);
  function end(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved && !cancelled)
      setPosition({
        edge: point.x + extent / 2 < viewport.width / 2 ? 'left' : 'right',
        ratio: viewport.height > extent ? point.y / (viewport.height - extent) : 0.5,
      });
    gesture.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div
      className="assistant-launcher-position"
      hidden={open}
      style={{ left: point.x, top: point.y, width: extent, height: extent }}
    >
      <Tooltip
        content={t('assistant.launcherHelp')}
        placement={position.edge === 'left' ? 'right' : 'top'}
      >
        <button
          type="button"
          className="assistant-launcher"
          data-edge={position.edge}
          data-dragging={!!drag}
          aria-label={t('assistant.open')}
          aria-expanded={open}
          aria-controls="megit-assistant-panel"
          style={{ width: extent, height: extent }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            suppress.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
            gesture.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: point.x,
              top: point.y,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            if (!start.moved && Math.hypot(dx, dy) < 5) return;
            start.moved = true;
            suppress.current = true;
            setDrag({
              x: Math.max(0, Math.min(start.left + dx, viewport.width - extent)),
              y: Math.max(0, Math.min(start.top + dy, viewport.height - extent)),
            });
          }}
          onPointerUp={(event) => end(event)}
          onPointerCancel={(event) => end(event, true)}
          onLostPointerCapture={(event) => end(event, true)}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || !event.key.startsWith('Arrow'))
              return;
            event.preventDefault();
            const step = event.shiftKey ? 40 : 10;
            setPosition((saved) => ({
              edge:
                event.key === 'ArrowLeft'
                  ? 'left'
                  : event.key === 'ArrowRight'
                    ? 'right'
                    : saved.edge,
              ratio: Math.max(
                0,
                Math.min(
                  1,
                  saved.ratio +
                    (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) /
                      Math.max(1, viewport.height - extent),
                ),
              ),
            }));
          }}
          onClick={(event) => {
            if (event.detail && suppress.current) {
              suppress.current = false;
              return;
            }
            onToggle();
          }}
        >
          <AssistantAvatar size={34} />
        </button>
      </Tooltip>
    </div>
  );
}
