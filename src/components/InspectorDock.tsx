import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dockBounds,
  inspectorKey,
  type InspectorItem,
  type InspectorState,
} from '../lib/inspector-dock';
import { defaults } from '../preferences/storage';
import { focusWithoutTooltip } from '../lib/overlays';
import { Tooltip } from './Tooltip';

export function InspectorDock({
  state,
  width,
  onWidth,
  onActive,
  onClose,
  children,
}: {
  state: InspectorState;
  width: number;
  onWidth: (width: number) => void;
  onActive: (key: string) => void;
  onClose: (key: string) => void;
  children: (item: InspectorItem, close: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const bounds = dockBounds(windowWidth);
  const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
  const effective = clamp(dragWidth ?? width);
  const lastRequest = useRef(-1);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = useCallback((key: string, smooth = true) => {
    const element = content.current;
    const card = Array.from(element?.children || []).find(
      (child) => (child as HTMLElement).dataset.key === key,
    ) as HTMLElement | undefined;
    if (!element || !card) return;
    const left = card.offsetLeft;
    const right = left + card.offsetWidth;
    const current = element.scrollLeft;
    const target =
      card.offsetWidth > element.clientWidth || left < current
        ? left
        : right > current + element.clientWidth
          ? right - element.clientWidth
          : current;
    element.scrollTo({ left: target, behavior: smooth && !reduced() ? 'smooth' : 'instant' });
  }, []);
  function close(key: string) {
    const index = state.items.findIndex((item) => inspectorKey(item) === key);
    const others = state.items.filter((item) => inspectorKey(item) !== key);
    const target =
      state.active === key
        ? others[Math.min(index, others.length - 1)]
        : others.find((item) => inspectorKey(item) === state.active);
    onClose(key);
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      focusWithoutTooltip(
        target
          ? document
              .getElementById(`${id}-panel-${inspectorKey(target)}`)
              ?.querySelector<HTMLElement>('[data-panel-close]')
          : document.querySelector<HTMLElement>('[data-details-trigger]'),
      );
    });
  }

  useEffect(() => {
    const resize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (lastRequest.current === state.request) return;
    const frame = requestAnimationFrame(() => {
      lastRequest.current = state.request;
      reveal(state.active);
    });
    return () => cancelAnimationFrame(frame);
  }, [state.request, state.active, reveal]);

  return (
    <section
      className={`inspector-dock ${dragWidth === null ? '' : 'resizing'}`}
      style={{ width: effective }}
      role="region"
      aria-label={t('dock.region')}
    >
      <Tooltip content={t('dock.resizeHelp')} placement="right" className="dock-resize-anchor">
        <div
          className="dock-resizer"
          role="separator"
          aria-label={t('dock.resize')}
          aria-orientation="vertical"
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuenow={Math.round(effective)}
          aria-controls={`${id}-content`}
          tabIndex={0}
          onDoubleClick={() => onWidth(clamp(defaults.inspectorWidth))}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointer: event.pointerId, x: event.clientX, width: effective };
            setDragWidth(effective);
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            setDragWidth(clamp(drag.current.width + drag.current.x - event.clientX));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            onWidth(clamp(drag.current.width + drag.current.x - event.clientX));
            drag.current = null;
            setDragWidth(null);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragWidth(null);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragWidth(null);
          }}
          onKeyDown={(event) => {
            const amount = event.shiftKey ? 64 : 16;
            const target =
              event.key === 'ArrowLeft'
                ? effective + amount
                : event.key === 'ArrowRight'
                  ? effective - amount
                  : event.key === 'Home'
                    ? bounds.min
                    : event.key === 'End'
                      ? bounds.max
                      : null;
            if (target === null) return;
            event.preventDefault();
            event.stopPropagation();
            onWidth(clamp(target));
          }}
        >
          <span />
        </div>
      </Tooltip>
      <div
        className="dock-panels"
        id={`${id}-content`}
        ref={content}
        aria-label={t('dock.content')}
        tabIndex={0}
      >
        {state.items.map((item) => {
          const key = inspectorKey(item);
          return (
            <div
              className={`dock-card ${state.active === key ? 'active' : ''}`}
              data-key={key}
              data-kind={item.kind}
              id={`${id}-panel-${key}`}
              key={key}
              onFocusCapture={() => onActive(key)}
              onPointerDownCapture={() => onActive(key)}
            >
              {children(item, () => close(key))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
