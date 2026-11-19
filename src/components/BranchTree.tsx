import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, LocateFixed, Minus, Plus } from 'lucide-react';
import type { BranchComparison, BranchTreeData, Commit } from '../../shared/types';
import { buildBranchTree } from '../lib/branch-tree';
import { CommitEvent } from './CommitEvent';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { CommitPointActions } from './CommitPointActions';
import { CollapsedCommitsPopover } from './CollapsedCommitsPopover';
import { dismissPopups } from '../lib/overlays';
import { useScrollMemory, viewStorage } from '../lib/use-view-state';
import { isFiniteNumber, isScrollPosition } from '../lib/view-storage';
import './branch-tree.css';

const minimumScale = 0.5;
const maximumScale = 2;
const mapInset = (element: HTMLElement) =>
  parseFloat(getComputedStyle(element).getPropertyValue('--branch-tree-map-inset')) || 0;

export function BranchTree({
  data,
  viewKey,
  selectedRef,
  comparison,
  expanded = false,
  onSelect,
  onCommit,
  onCreateBranch,
  createDisabled,
  tools,
}: {
  data: BranchTreeData;
  viewKey?: string;
  selectedRef: string | null;
  comparison?: BranchComparison | null;
  expanded?: boolean;
  onSelect: (ref: string) => void;
  onCommit: (commit: Commit) => void;
  onCreateBranch: (commit: Commit) => void;
  createDisabled?: string;
  tools?: ReactNode;
}) {
  const { t } = useTranslation();
  const [activeCommit, setActiveCommit] = useState<string | null>(null);
  const onCommitOpen = useCallback((hash: string, open: boolean) => {
    setActiveCommit((current) => (open ? hash : current === hash ? null : current));
  }, []);
  const layout = useMemo(() => buildBranchTree(data, { expanded }), [data, expanded]);
  const viewport = useRef<HTMLDivElement>(null);
  const [initialScale] = useState(() => {
    const saved = viewKey ? viewStorage.read(`${viewKey}.scale`) : undefined;
    return isFiniteNumber(saved) && saved >= minimumScale && saved <= maximumScale ? saved : 1;
  });
  const [hasSavedPosition] = useState(
    () => !!viewKey && isScrollPosition(viewStorage.read(`${viewKey}.scroll`)),
  );
  useScrollMemory(viewport, viewKey && `${viewKey}.scroll`);
  const [view, setView] = useState<{ scale: number; scroll: { left: number; top: number } | null }>(
    { scale: initialScale, scroll: null },
  );
  const { scale } = view;
  const currentScale = useRef(initialScale);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);
  const stopPan = useCallback(() => {
    const active = drag.current;
    drag.current = null;
    const element = viewport.current;
    if (active && element?.hasPointerCapture(active.pointer))
      element.releasePointerCapture(active.pointer);
    setPanning(false);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stopPan();
    };
    window.addEventListener('blur', stopPan);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', stopPan);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stopPan]);
  const zoom = useCallback(
    (requested: number, point?: { x: number; y: number }) => {
      const element = viewport.current;
      if (!element) return;
      const next = Math.max(minimumScale, Math.min(maximumScale, requested));
      const previous = currentScale.current;
      if (next === previous) return;
      const rect = element.getBoundingClientRect();
      const x = point ? point.x - rect.left - element.clientLeft : element.clientWidth / 2;
      const y = point ? point.y - rect.top - element.clientTop : element.clientHeight / 2;
      const left = pendingScroll.current?.left ?? element.scrollLeft;
      const top = pendingScroll.current?.top ?? element.scrollTop;
      const oldMargin = Math.max(0, (element.clientWidth - layout.width * previous) / 2);
      const newMargin = Math.max(0, (element.clientWidth - layout.width * next) / 2);
      const inset = mapInset(element);
      // Predict the next scroll synchronously so a burst of pinch events keeps one anchor.
      pendingScroll.current = {
        left: Math.max(
          0,
          Math.min(
            layout.width * next - element.clientWidth,
            ((left + x - oldMargin) / previous) * next + newMargin - x,
          ),
        ),
        top: Math.max(
          0,
          Math.min(
            layout.height * next + inset - element.clientHeight,
            ((top + y - inset) / previous) * next + inset - y,
          ),
        ),
      };
      currentScale.current = next;
      if (viewKey) viewStorage.write(`${viewKey}.scale`, next);
      // Keep scroll and scale in one update, even when a burst returns to the rendered scale.
      setView({ scale: next, scroll: pendingScroll.current });
    },
    [layout.width, layout.height, viewKey],
  );
  useLayoutEffect(() => {
    if (view.scroll) {
      viewport.current?.scrollTo({ ...view.scroll, behavior: 'instant' });
      pendingScroll.current = null;
    }
  }, [view]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      // Top-layer menus / detailed hints are still DOM descendants of the map.
      // Their content must scroll independently, without bubbling into map zoom.
      if (event.target instanceof Element && event.target.closest('[popover]')) {
        if (event.ctrlKey) event.preventDefault();
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (!event.ctrlKey) {
        if (event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          const delta =
            Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          element.scrollBy({ left: delta * unit, behavior: 'instant' });
        }
        // Ordinary wheel and two-finger scrolling retain native vertical / horizontal movement.
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      const delta = Math.max(-160, Math.min(160, event.deltaY * unit));
      zoom(currentScale.current * Math.exp(-delta * 0.01), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    // Trackpad pinch is Ctrl+wheel in Edge. A React/passive wheel handler cannot cancel page zoom.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);
  const source = new Set(comparison?.sourceCommits || []);
  const target = new Set(comparison?.targetCommits || []);
  const baseHash = data.branches.find((branch) => branch.ref === data.baseRef)?.hash || data.head;
  const trunkTop = layout.nodes.find((node) => node.commit.hash === baseHash)?.y || 0;
  const center = useCallback(() => {
    const element = viewport.current;
    if (element)
      element.scrollTo({
        left: Math.max(0, (layout.width * currentScale.current - element.clientWidth) / 2),
        top: Math.max(0, trunkTop * currentScale.current + mapInset(element) - 128),
        behavior: 'instant',
      });
  }, [layout.width, trunkTop]);
  const positioned = useRef(false);
  // Position once before the first paint. Selection and later data updates
  // preserve the user's view; only the explicit center control repositions it.
  useLayoutEffect(() => {
    if (positioned.current || !layout.nodes.length) return;
    positioned.current = true;
    if (!hasSavedPosition) center();
  }, [center, layout.nodes.length, hasSavedPosition]);
  return (
    <div className="branch-tree-graphic">
      <div
        className={`branch-tree-viewport${panning ? ' panning' : ''}`}
        ref={viewport}
        role="region"
        aria-label={t('branchTree.region')}
        tabIndex={0}
        onContextMenu={(event) => {
          if (event.target instanceof Element && event.target.closest('[popover]')) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 2 ||
            event.pointerType !== 'mouse' ||
            (event.target instanceof Element && event.target.closest('[popover]'))
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          dismissPopups();
          const element = event.currentTarget;
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          };
          element.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointer !== event.pointerId) return;
          if (!(event.buttons & 2)) {
            stopPan();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.scrollTo({
            left: active.left + active.x - event.clientX,
            top: active.top + active.y - event.clientY,
            behavior: 'instant',
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointer !== event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          stopPan();
        }}
        onPointerCancel={stopPan}
        onLostPointerCapture={stopPan}
      >
        <div
          className="branch-tree-canvas"
          style={{ width: layout.width * scale, height: layout.height * scale, minWidth: '100%' }}
        >
          <div
            className="branch-tree-position"
            style={{ width: layout.width * scale, height: layout.height * scale }}
          >
            <div
              className="branch-tree-drawing"
              style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
            >
              <svg
                width={layout.width}
                height={layout.height}
                aria-hidden="true"
                className={`branch-tree-lines ${comparison ? 'comparing' : ''}`}
              >
                {layout.edges.map((edge) => {
                  const sourceEdge =
                    source.has(edge.child) || edge.via.some((hash) => source.has(hash));
                  const targetEdge =
                    target.has(edge.child) || edge.via.some((hash) => target.has(hash));
                  const branchRef = layout.nodes.find((node) => node.commit.hash === edge.child)
                    ?.branches[0]?.ref;
                  return (
                    <g key={`${edge.child}:${edge.parent}`}>
                      <path
                        d={edge.path}
                        data-merge={edge.merge || undefined}
                        className={`tree-edge ${edge.trunk ? 'trunk' : ''} ${edge.merge ? 'merge' : ''} ${sourceEdge ? 'source-only' : targetEdge ? 'target-only' : ''}`}
                      />
                      {branchRef && (
                        <path
                          d={edge.path}
                          className="tree-edge-hit"
                          onClick={() => onSelect(branchRef)}
                        />
                      )}
                    </g>
                  );
                })}
                {layout.boundaries.map((boundary) => (
                  <path
                    key={`${boundary.child}:${boundary.parent}`}
                    d={`M ${boundary.x} ${boundary.y - 28} v 32`}
                    className="tree-boundary"
                  />
                ))}
                {layout.nodes.map((node) => (
                  <g
                    key={node.commit.hash}
                    data-node-commit={node.commit.hash}
                    className={`tree-node ${activeCommit === node.commit.hash ? 'active' : ''} ${node.onTrunk ? 'trunk' : ''} ${source.has(node.commit.hash) ? 'source-only' : target.has(node.commit.hash) ? 'target-only' : ''}`}
                  >
                    {data.head === node.commit.hash ? (
                      <rect className="tree-head-marker" x={node.x} y={node.y} />
                    ) : (
                      <circle cx={node.x} cy={node.y} r={node.branches.length ? 6 : 4} />
                    )}
                  </g>
                ))}
              </svg>
              {layout.nodes.map((node) => (
                <div key={node.commit.hash}>
                  <span className="tree-commit-anchor" style={{ left: node.x, top: node.y }}>
                    <CommitPointActions
                      commit={node.commit}
                      onOpenChange={onCommitOpen}
                      scale={scale}
                      current={data.head === node.commit.hash}
                      onCreate={onCreateBranch}
                      onDiff={onCommit}
                      createDisabled={createDisabled}
                    />
                  </span>
                  {node.branches.map((branch, index) => (
                    <span
                      key={branch.ref}
                      className="tree-tip-anchor"
                      style={{ left: node.x, top: node.y - 24 / scale - index * 44 }}
                    >
                      <Tooltip
                        detailed
                        content={
                          <>
                            <strong>{branch.name}</strong>
                            <CommitEvent
                              commit={{
                                ...branch,
                                shortHash: branch.hash.slice(0, 7),
                                refs: branch.ref,
                              }}
                            />
                          </>
                        }
                      >
                        <button
                          type="button"
                          data-ref={branch.ref}
                          className={`tree-tip ${node.onTrunk ? 'on-trunk' : ''} ${branch.current ? 'current' : ''} ${branch.remote ? 'remote' : ''} ${selectedRef === branch.ref ? 'selected' : ''}`}
                          aria-label={t('branchTree.viewBranch', { name: branch.name })}
                          aria-pressed={selectedRef === branch.ref}
                          onClick={() => onSelect(branch.ref)}
                        >
                          <GitBranch size={13} />
                          <span>{branch.name}</span>
                          {branch.current && (
                            <span
                              className="tree-head-mark"
                              aria-label={t('branchTree.headLegend')}
                            >
                              {t('branchTree.head')}
                            </span>
                          )}
                        </button>
                      </Tooltip>
                    </span>
                  ))}
                </div>
              ))}
              {layout.edges
                .filter((edge) => edge.via.length)
                .map((edge) => {
                  return (
                    <span
                      key={`fold:${edge.child}:${edge.parent}`}
                      className="tree-fold-anchor"
                      style={{ left: edge.label.x + 12, top: edge.label.y }}
                    >
                      <CollapsedCommitsPopover
                        data={data}
                        edge={edge}
                        scale={scale}
                        comparison={comparison}
                        onCommit={onCommit}
                        onCreateBranch={onCreateBranch}
                        createDisabled={createDisabled}
                      />
                    </span>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      <div
        className="branch-tree-view-controls"
        role="group"
        aria-label={t('branchTree.mapControls')}
      >
        <IconButton
          size="small"
          label={t('branchTree.zoomOut')}
          disabled={scale <= minimumScale}
          onClick={() => zoom(Math.round((currentScale.current - 0.1) * 100) / 100)}
        >
          <Minus size={15} />
        </IconButton>
        <IconButton size="small" label={t('branchTree.fit')} onClick={center}>
          <LocateFixed size={15} />
        </IconButton>
        <IconButton
          size="small"
          label={t('branchTree.zoomIn')}
          disabled={scale >= maximumScale}
          onClick={() => zoom(Math.round((currentScale.current + 0.1) * 100) / 100)}
        >
          <Plus size={15} />
        </IconButton>
        {tools && <div className="branch-tree-extra-tools">{tools}</div>}
      </div>
    </div>
  );
}
