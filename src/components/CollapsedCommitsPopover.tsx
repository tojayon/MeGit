import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BranchComparison, BranchTreeData, Commit } from '../../shared/types';
import type { TreeEdge } from '../lib/branch-tree';
import { commitSegment } from '../lib/commit-segment';
import {
  dismissPopupEvent,
  dismissPopups,
  focusWithoutTooltip,
  withoutFocusTooltip,
} from '../lib/overlays';
import { CommitPointActions } from './CommitPointActions';
import { Tooltip } from './Tooltip';

export function CollapsedCommitsPopover({
  data,
  edge,
  scale,
  comparison,
  onCommit,
  onCreateBranch,
  createDisabled,
}: {
  data: BranchTreeData;
  edge: TreeEdge;
  scale: number;
  comparison?: BranchComparison | null;
  onCommit: (commit: Commit) => void;
  onCreateBranch: (commit: Commit) => void;
  createDisabled?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const segment = useMemo(() => commitSegment(data.commits, edge), [data.commits, edge]);
  const commits = segment.slice(1, -1);
  const [activeCommit, setActiveCommit] = useState<string | null>(null);
  const onCommitOpen = useCallback((hash: string, open: boolean) => {
    setActiveCommit((current) => (open ? hash : current === hash ? null : current));
  }, []);
  const visible = open && segment.length > 0;

  function close(restore = false) {
    if (restore) focusWithoutTooltip(trigger.current);
    setOpen(false);
  }

  useLayoutEffect(() => {
    const element = panel.current;
    const button = trigger.current;
    if (!visible || !element || !button) return;
    element.showPopover();
    const position = () => {
      const rect = button.getBoundingClientRect();
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const gap = parseFloat(getComputedStyle(element).getPropertyValue('--commit-lens-tail-gap'));
      const center = rect.top + rect.height / 2;
      const right = rect.right + gap;
      const onRight = right + width <= innerWidth - 8;
      const left = onRight ? right : rect.left - width - gap;
      const top = Math.max(8, Math.min(center - height / 2, innerHeight - height - 8));
      element.dataset.side = onRight ? 'right' : 'left';
      element.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
      element.style.top = `${top}px`;
      element.style.setProperty(
        '--commit-lens-tail-top',
        `${Math.max(12, Math.min(center - top, height - 12))}px`,
      );
    };
    position();
    focusWithoutTooltip(element);
    const observer = new ResizeObserver(position);
    observer.observe(element);
    return () => {
      observer.disconnect();
      withoutFocusTooltip(() => {
        if (element.matches(':popover-open')) element.hidePopover();
      });
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const initial = trigger.current!.getBoundingClientRect();
    const dismiss = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail?.preserve === panel.current) return;
      if (panel.current?.contains(document.activeElement)) focusWithoutTooltip(trigger.current);
      setOpen(false);
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (
        !rect ||
        Math.abs(rect.left - initial.left) > 0.5 ||
        Math.abs(rect.top - initial.top) > 0.5
      )
        dismiss();
    };
    const wheel = (event: Event) => {
      if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) dismiss();
    };
    const hidden = () => {
      if (document.hidden) dismiss();
    };
    document.addEventListener(dismissPopupEvent, dismiss);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener(dismissPopupEvent, dismiss);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [visible]);

  return (
    <span
      ref={container}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <Tooltip
        detailed
        disabled={visible}
        content={
          <span className="git-help-content">
            <strong>{t('branchTree.folded', { count: edge.via.length })}</strong>
            <span>{t('branchTree.foldedMeaning', { count: edge.via.length })}</span>
            <span>{t('branchTree.localHistoryHelp')}</span>
          </span>
        }
      >
        <button
          ref={trigger}
          type="button"
          className="tree-fold-count"
          style={{ transform: `scale(${1 / scale})`, transformOrigin: 'left center' }}
          aria-label={t('branchTree.folded', { count: edge.via.length })}
          aria-haspopup="dialog"
          aria-expanded={visible}
          aria-controls={visible ? id : undefined}
          onClick={() => {
            if (visible) close();
            else {
              dismissPopups();
              setOpen(true);
            }
          }}
        >{`+${edge.via.length}`}</button>
      </Tooltip>
      {visible && (
        <div
          ref={panel}
          id={id}
          popover="manual"
          role="dialog"
          tabIndex={-1}
          aria-label={t('branchTree.localHistory')}
          className="commit-history-lens"
        >
          <div
            className="commit-history-lens-map"
            role="region"
            aria-label={t('branchTree.localTree')}
            tabIndex={0}
          >
            <div
              className="commit-history-lens-chain"
              style={{ height: `calc(var(--commit-lens-row-height) * ${commits.length + 1})` }}
            >
              <svg className="branch-tree-lines" width="100%" height="100%" aria-hidden="true">
                {segment.slice(0, -1).map((item, index) => {
                  const highlight = comparison?.sourceCommits.includes(item.hash)
                    ? ' source-only'
                    : comparison?.targetCommits.includes(item.hash)
                      ? ' target-only'
                      : '';
                  return (
                    <line
                      key={item.hash}
                      x1="50%"
                      x2="50%"
                      y1={`${(index / (segment.length - 1)) * 100}%`}
                      y2={`${((index + 1) / (segment.length - 1)) * 100}%`}
                      className={`tree-edge${edge.trunk ? ' trunk' : ''}${edge.merge && index === 0 ? ' merge' : ''}${highlight}`}
                    />
                  );
                })}
                {commits.map((item, index) => {
                  const highlight = comparison?.sourceCommits.includes(item.hash)
                    ? ' source-only'
                    : comparison?.targetCommits.includes(item.hash)
                      ? ' target-only'
                      : '';
                  const y = `${((index + 1) / (commits.length + 1)) * 100}%`;
                  return (
                    <g
                      key={item.hash}
                      data-node-commit={item.hash}
                      className={`tree-node${activeCommit === item.hash ? ' active' : ''}${edge.trunk ? ' trunk' : ''}${highlight}`}
                    >
                      {data.head === item.hash ? (
                        <rect className="tree-head-marker" x="50%" y={y} />
                      ) : (
                        <circle
                          cx="50%"
                          cy={y}
                          r={data.branches.some((branch) => branch.hash === item.hash) ? 6 : 4}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {commits.map((item, index) => (
                <span
                  key={item.hash}
                  data-lens-commit={item.hash}
                  className="tree-commit-anchor"
                  style={{
                    left: '50%',
                    top: `calc(var(--commit-lens-row-height) * ${index + 1})`,
                  }}
                >
                  <CommitPointActions
                    commit={item}
                    onOpenChange={onCommitOpen}
                    scale={1}
                    current={data.head === item.hash}
                    popupParent={panel}
                    createDisabled={createDisabled}
                    onDiff={(commit) => {
                      close(true);
                      onCommit(commit);
                    }}
                    onCreate={(commit) => {
                      close(true);
                      onCreateBranch(commit);
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
