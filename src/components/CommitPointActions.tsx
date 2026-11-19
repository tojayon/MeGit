import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, FileDiff, GitBranchPlus, LoaderCircle, X } from 'lucide-react';
import type { Commit } from '../../shared/types';
import {
  dismissPopupEvent,
  dismissPopups,
  focusWithoutTooltip,
  withoutFocusTooltip,
} from '../lib/overlays';
import { Button } from './Button';
import { GitHelp } from './GitHelp';
import { CommitEvent } from './CommitEvent';
import { commitDiffArguments, createBranchArguments } from '../../shared/git-commands';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export function CommitPointActions({
  commit,
  scale,
  current = false,
  createDisabled,
  onCreate,
  onDiff,
  popupParent,
  onOpenChange,
}: {
  commit: Commit;
  scale: number;
  current?: boolean;
  createDisabled?: string;
  onCreate: (commit: Commit) => void;
  onDiff: (commit: Commit) => void;
  popupParent?: RefObject<HTMLElement | null>;
  onOpenChange?: (hash: string, open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle');
  const copying = useRef<number | null>(null);
  const session = useRef(0);
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    onOpenChange?.(commit.hash, true);
    return () => onOpenChange?.(commit.hash, false);
  }, [open, commit.hash, onOpenChange]);

  function close(restore = false) {
    if (restore) focusWithoutTooltip(trigger.current);
    setOpen(false);
  }

  useLayoutEffect(() => {
    const element = panel.current;
    const button = trigger.current;
    if (!open || !element || !button) return;
    element.showPopover();
    const position = () => {
      const rect = button.getBoundingClientRect();
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      // Top-layer coordinates stay in screen pixels even inside the scaled map.
      element.style.left = `${Math.max(8, Math.min(rect.right + 8, innerWidth - width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(rect.top - height / 2, innerHeight - height - 8))}px`;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const currentSession = session.current + 1;
    session.current = currentSession;
    const initial = trigger.current!.getBoundingClientRect();
    const dismiss = () => {
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
      // Ignore delayed notifications from the scroll that revealed the clicked point.
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
      session.current = currentSession + 1;
      document.removeEventListener(dismissPopupEvent, dismiss);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [open]);

  return (
    <span
      ref={container}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <Tooltip detailed disabled={open} content={<CommitEvent commit={commit} />}>
        <button
          ref={trigger}
          type="button"
          className="tree-commit-hit"
          style={{ transform: `scale(${1 / scale})` }}
          data-commit={commit.hash}
          aria-current={current ? 'location' : undefined}
          aria-label={t('branchTree.openCommitActions', {
            hash: commit.shortHash,
            subject: commit.subject,
          })}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            if (open) close();
            else {
              dismissPopups(popupParent?.current);
              setCopy('idle');
              setOpen(true);
            }
          }}
        />
      </Tooltip>
      {open && (
        <div
          ref={panel}
          id={id}
          popover="manual"
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          className="commit-point-actions"
        >
          <header>
            <h3 id={`${id}-title`}>{t('branchTree.commitActions')}</h3>
            <IconButton
              size="small"
              label={t('common.close', { name: t('branchTree.commitActions') })}
              onClick={() => close(true)}
            >
              <X size={15} />
            </IconButton>
          </header>
          <div className="commit-point-summary">
            <strong>{commit.subject}</strong>
            <span>
              {commit.author} · <code>{commit.shortHash}</code>
            </span>
          </div>
          <div className="commit-point-buttons">
            <Tooltip
              detailed
              placement="right"
              content={
                <GitHelp
                  topic="createFromCommit"
                  preview={{
                    when: 'name',
                    commands: [
                      createBranchArguments({
                        name: '<branch-name>',
                        startPoint: 'COMMIT',
                        startHash: commit.hash,
                        track: false,
                        checkout: false,
                      }),
                    ],
                  }}
                />
              }
            >
              <Button
                icon={<GitBranchPlus size={17} />}
                disabled={!!createDisabled}
                onClick={() => {
                  close(true);
                  onCreate(commit);
                }}
              >
                {t('branchTree.createFromCommit')}
              </Button>
            </Tooltip>
            <Tooltip
              detailed
              placement="right"
              content={
                <GitHelp
                  topic="commitDiff"
                  preview={{ when: 'read', commands: [commitDiffArguments(commit.hash)] }}
                />
              }
            >
              <Button
                icon={<FileDiff size={17} />}
                onClick={() => {
                  close(true);
                  onDiff(commit);
                }}
              >
                {t('branchTree.commitDiff')}
              </Button>
            </Tooltip>
            <Tooltip
              detailed
              placement="right"
              content={<GitHelp topic="copyCommit" preview={{ empty: 'clipboard' }} />}
            >
              <Button
                icon={
                  copy === 'pending' ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : copy === 'done' ? (
                    <Check size={17} />
                  ) : (
                    <Copy size={17} />
                  )
                }
                aria-busy={copy === 'pending' || undefined}
                aria-disabled={copy === 'pending' || undefined}
                onClick={async () => {
                  if (copying.current === session.current) return;
                  const current = session.current;
                  copying.current = current;
                  setCopy('pending');
                  try {
                    await navigator.clipboard.writeText(commit.hash);
                    if (session.current === current) setCopy('done');
                  } catch {
                    if (session.current === current) setCopy('failed');
                  } finally {
                    if (copying.current === current) copying.current = null;
                  }
                }}
              >
                {t('branchTree.copyCommit')}
              </Button>
            </Tooltip>
          </div>
          {createDisabled && (
            <p className="warning-text" role="status">
              {createDisabled}
            </p>
          )}
          {copy === 'done' && (
            <p className="success-text" role="status">
              {t('branchTree.commitCopied')}
            </p>
          )}
          {copy === 'failed' && (
            <div className="commit-point-copy-failure">
              <p className="error-message" role="alert">
                {t('branchTree.copyFailed')}
              </p>
              <code tabIndex={0}>{commit.hash}</code>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
