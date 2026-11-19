import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { EdgeLabelRenderer, useReactFlow, useViewport } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { usePreferences } from '../preferences/store';
import { snapRouteMove } from '../lib/edge-route-snapping';
import type { SnapGuide, SnapLocks } from '../lib/snapping';
import {
  compactRoute,
  moveRouteSegment,
  roundedRoute,
  routePoints,
  type RoutePoint,
} from '../lib/edge-route';

export type RouteEditing = {
  editing: boolean;
  onRoute: (id: string, points: RoutePoint[] | undefined) => void;
};

const bounded = (points: RoutePoint[]) =>
  points.map((p) => ({
    x: Math.max(-100000, Math.min(100000, p.x)),
    y: Math.max(-100000, Math.min(100000, p.y)),
  }));

export function useEdgeRoute({
  id,
  automaticPath,
  source,
  target,
  waypoints,
  radius = 12,
  editing,
  onRoute,
}: {
  id: string;
  automaticPath: string;
  source: RoutePoint;
  target: RoutePoint;
  waypoints?: RoutePoint[];
  radius?: number;
} & RouteEditing) {
  const { t } = useTranslation();
  const { zoom } = useViewport();
  const { preferences } = usePreferences();
  const { screenToFlowPosition } = useReactFlow();
  const [draft, setDraft] = useState<RoutePoint[] | null>(null);
  const [controlDraft, setControlDraft] = useState<RoutePoint[] | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const gesture = useRef<{
    pointer: number;
    element: HTMLElement;
    origin: RoutePoint;
    points: RoutePoint[];
    preview: RoutePoint[];
    kind: 'segment' | 'point';
    index: number;
    moved: boolean;
    delta: RoutePoint;
    alt: boolean;
    locks: SnapLocks;
  } | null>(null);
  const saved = waypoints?.length ? [source, ...waypoints, target] : routePoints(automaticPath);
  const points = draft || saved;
  const path = draft || waypoints?.length ? roundedRoute(points, radius) : automaticPath;
  const longest = points.slice(1).reduce<{ length: number; x: number; y: number }>(
    (best, point, i) => {
      const length = Math.hypot(point.x - points[i].x, point.y - points[i].y);
      return length > best.length
        ? { length, x: (point.x + points[i].x) / 2, y: (point.y + points[i].y) / 2 }
        : best;
    },
    { length: -1, x: source.x, y: source.y },
  );

  const cancel = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current?.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
    setDraft(null);
    setControlDraft(null);
    setGuides([]);
  }, []);
  const preview = useCallback(() => {
    const current = gesture.current;
    if (!current?.moved) return;
    const result = snapRouteMove(
      current.points,
      current.kind,
      current.index,
      current.delta,
      zoom,
      current.locks,
      preferences.snappingEnabled && !current.alt,
    );
    current.locks = result.locks;
    current.preview = bounded(result.points);
    setDraft(current.preview);
    setGuides(result.guides);
  }, [zoom, preferences.snappingEnabled]);
  useEffect(() => {
    const alt = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || !gesture.current) return;
      gesture.current.alt = event.type === 'keydown';
      preview();
    };
    const frame = requestAnimationFrame(preview);
    window.addEventListener('keydown', alt, true);
    window.addEventListener('keyup', alt, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', alt, true);
      window.removeEventListener('keyup', alt, true);
    };
  }, [preview]);
  const sourceVersion = JSON.stringify([source, target, waypoints, editing, zoom]);
  useEffect(() => {
    const frame = requestAnimationFrame(cancel);
    return () => cancelAnimationFrame(frame);
  }, [sourceVersion, cancel]);
  useEffect(() => {
    if (!editing) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    const pointer = (event: PointerEvent) => {
      if (gesture.current && event.pointerId !== gesture.current.pointer) cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      const current = gesture.current;
      gesture.current = null;
      if (current?.element.hasPointerCapture(current.pointer))
        current.element.releasePointerCapture(current.pointer);
    };
  }, [cancel, editing]);

  function save(next: RoutePoint[], simplify = true) {
    const limited = bounded(next);
    const result = (simplify ? compactRoute(limited) : limited).slice(1, -1);
    if (result.length > 20) return;
    if (
      JSON.stringify(result.length ? result : undefined) !==
      JSON.stringify(waypoints?.length ? waypoints : undefined)
    )
      onRoute(id, result.length ? result : undefined);
  }
  function start(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: 'point' | 'segment',
    index: number,
  ) {
    if (!editing || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === 'segment' && points.length >= 22 && (index === 0 || index === points.length - 2))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setControlDraft(points);
    gesture.current = {
      pointer: event.pointerId,
      element: event.currentTarget,
      origin: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      points,
      preview: points,
      kind,
      index,
      moved: false,
      delta: { x: 0, y: 0 },
      alt: event.altKey,
      locks: {},
    };
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const delta = { x: position.x - current.origin.x, y: position.y - current.origin.y };
    if (!current.moved && Math.hypot(delta.x, delta.y) * zoom < 3) return;
    current.moved = true;
    current.delta = delta;
    current.alt = event.altKey;
    preview();
  }
  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = null;
    if (current.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
    if (current.moved) save(current.preview);
    setDraft(null);
    setControlDraft(null);
    setGuides([]);
  }

  const controlPoints = controlDraft || points;
  const controls = editing ? (
    <EdgeLabelRenderer>
      {guides.length > 0 && (
        <svg className="edge-route-guides" data-route-guides={id} aria-hidden="true">
          {guides.map((guide, index) => (
            <line
              key={index}
              x1={guide.x1}
              y1={guide.y1}
              x2={guide.x2}
              y2={guide.y2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
      {controlPoints.slice(0, -1).map((point, index) => {
        const next = controlPoints[index + 1];
        if (Math.hypot(next.x - point.x, next.y - point.y) * zoom < 32) return null;
        return control({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }, 'segment', index);
      })}
      {controlPoints.slice(1, -1).map((point, index) => control(point, 'point', index + 1))}
    </EdgeLabelRenderer>
  ) : null;

  function control(point: RoutePoint, kind: 'point' | 'segment', index: number) {
    return (
      <div
        key={`${kind}-${index}`}
        className="edge-route-anchor"
        style={{ transform: `translate(${point.x}px, ${point.y}px) scale(${1 / zoom})` }}
      >
        <Tooltip
          content={t(kind === 'point' ? 'routing.pointHelp' : 'routing.segmentHelp')}
          placement="top"
        >
          <button
            type="button"
            className={`edge-route-handle edge-route-${kind} nodrag nopan nowheel`}
            data-route-edge={id}
            data-route-kind={kind}
            data-route-index={index}
            aria-label={t(kind === 'point' ? 'routing.point' : 'routing.segment', {
              count: index + 1,
            })}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => start(event, kind, index)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => cancel()}
            onLostPointerCapture={() => {
              if (gesture.current) cancel();
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (kind === 'point')
                save(
                  points.filter((_, i) => i !== index),
                  false,
                );
              else if (points.length < 22)
                save([...points.slice(0, index + 1), point, ...points.slice(index + 1)], false);
            }}
            onKeyDown={(event) => {
              if (kind === 'point' && ['Delete', 'Backspace'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                save(
                  points.filter((_, i) => i !== index),
                  false,
                );
                return;
              }
              const delta = {
                ArrowLeft: { x: -1, y: 0 },
                ArrowRight: { x: 1, y: 0 },
                ArrowUp: { x: 0, y: -1 },
                ArrowDown: { x: 0, y: 1 },
              }[event.key];
              if (!delta) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 50 : 10;
              const change = { x: delta.x * step, y: delta.y * step };
              save(
                kind === 'segment'
                  ? moveRouteSegment(points, index, change)
                  : points.map((p, i) =>
                      i === index ? { x: p.x + change.x, y: p.y + change.y } : p,
                    ),
                false,
              );
            }}
          >
            <span aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    );
  }
  return { path, controls, label: longest, custom: !!(draft || waypoints?.length) };
}
