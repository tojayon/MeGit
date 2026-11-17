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
import { GitHelp } from './GitHelp';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import './branch-tree.css';

const minimumScale = 0.5;
const maximumScale = 2;
const mapInset = (element: HTMLElement) =>
  parseFloat(getComputedStyle(element).getPropertyValue('--branch-tree-map-inset')) || 0;

export function BranchTree({
  data,
  selectedRef,
  comparison,
  expanded = false,
  onSelect,
  onCommit,
  tools,
}: {
  data: BranchTreeData;
  selectedRef: string | null;
  comparison?: BranchComparison | null;
  expanded?: boolean;
  onSelect: (ref: string) => void;
  onCommit: (commit: Commit) => void;
  tools?: ReactNode;
}) {
  const { t } = useTranslation();
  const layout = useMemo(() => buildBranchTree(data, { expanded }), [data, expanded]);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ scale: number; scroll: { left: number; top: number } | null }>(
    { scale: 1, scroll: null },
  );
  const { scale } = view;
  const currentScale = useRef(1);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
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
      // Keep scroll and scale in one update, even when a burst returns to the rendered scale.
      setView({ scale: next, scroll: pendingScroll.current });
    },
    [layout.width, layout.height],
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
      // Horizontal and Shift scrolling keep their native map / multi-panel behavior.
      if (
        !event.deltaY ||
        event.shiftKey ||
        (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = Math.max(-160, Math.min(160, event.deltaY * unit));
      zoom(currentScale.current * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0025)), {
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
  const center = () => {
    const element = viewport.current;
    if (element)
      element.scrollTo({
        left: Math.max(0, (layout.width * currentScale.current - element.clientWidth) / 2),
        top: Math.max(0, trunkTop * currentScale.current + mapInset(element) - 128),
        behavior: 'instant',
      });
  };
  // Keep layout changes centered while ordinary inspector resizing preserves the view.
  useEffect(() => {
    const element = viewport.current;
    if (element)
      element.scrollTo({
        left: Math.max(0, (layout.width * currentScale.current - element.clientWidth) / 2),
        top: Math.max(0, trunkTop * currentScale.current + mapInset(element) - 128),
        behavior: 'instant',
      });
  }, [data.baseRef, layout.width, trunkTop]);
  const selectedNode = layout.nodes.find((node) =>
    node.branches.some((branch) => branch.ref === selectedRef),
  );
  const selectedX = selectedNode?.x;
  const selectedY = selectedNode?.y;
  useEffect(() => {
    const element = viewport.current;
    if (element && selectedX !== undefined && selectedY !== undefined)
      element.scrollTo({
        left: Math.max(0, selectedX * currentScale.current - element.clientWidth / 2),
        top: Math.max(0, selectedY * currentScale.current + mapInset(element) - 128),
        behavior: 'instant',
      });
  }, [selectedRef, selectedX, selectedY]);
  return (
    <div className="branch-tree-graphic">
      <div
        className="branch-tree-viewport"
        ref={viewport}
        role="region"
        aria-label={t('branchTree.region')}
        tabIndex={0}
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
                      {!!edge.via.length && (
                        <text
                          className="tree-fold-count"
                          x={layout.nodes.find((node) => node.commit.hash === edge.child)!.x + 12}
                          y={
                            (layout.nodes.find((node) => node.commit.hash === edge.child)!.y +
                              layout.nodes.find((node) => node.commit.hash === edge.parent)!.y) /
                            2
                          }
                        >{`+${edge.via.length}`}</text>
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
                    className={`tree-node ${node.onTrunk ? 'trunk' : ''} ${source.has(node.commit.hash) ? 'source-only' : target.has(node.commit.hash) ? 'target-only' : ''}`}
                  >
                    {data.head === node.commit.hash && (
                      <circle className="tree-head-ring" cx={node.x} cy={node.y} r={12} />
                    )}
                    <circle cx={node.x} cy={node.y} r={node.branches.length ? 6 : 4} />
                  </g>
                ))}
              </svg>
              {layout.nodes.map((node) => (
                <div key={node.commit.hash}>
                  <span className="tree-commit-anchor" style={{ left: node.x, top: node.y }}>
                    <Tooltip
                      detailed
                      content={
                        <>
                          <strong>{node.commit.subject}</strong>
                          <span>
                            {node.commit.author} · {node.commit.shortHash}
                          </span>
                          <GitHelp topic="commitDiff" />
                        </>
                      }
                    >
                      <button
                        type="button"
                        className="tree-commit-hit"
                        aria-label={t('branchTree.viewCommit', {
                          hash: node.commit.shortHash,
                          subject: node.commit.subject,
                        })}
                        onClick={() => onCommit(node.commit)}
                      />
                    </Tooltip>
                  </span>
                  {node.branches.map((branch, index) => (
                    <span
                      key={branch.ref}
                      className="tree-tip-anchor"
                      style={{ left: node.x, top: node.y - 42 - index * 44 }}
                    >
                      <Tooltip
                        detailed
                        content={
                          <>
                            <strong>{branch.name}</strong>
                            <GitHelp topic={branch.remote ? 'remoteBranches' : 'branchTree'} />
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
