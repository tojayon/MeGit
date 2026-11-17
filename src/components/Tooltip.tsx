import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  dismissTooltipEvent,
  dismissTooltips,
  focusWithoutTooltip,
  isAutomaticFocus,
} from '../lib/overlays';

export function Tooltip({
  content,
  children,
  placement = 'bottom',
  disabled = false,
  className = '',
  detailed = false,
  toggleOnClick = false,
  openDelay = 0,
}: {
  content: ReactNode;
  children: ReactElement<{ 'aria-describedby'?: string; 'aria-expanded'?: boolean }>;
  placement?: 'top' | 'bottom' | 'right';
  disabled?: boolean;
  className?: string;
  detailed?: boolean;
  toggleOnClick?: boolean;
  openDelay?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const activated = useRef(false);
  const pinned = useRef(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visible = open && !disabled;

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!visible || !anchor.current || !bubble.current) return;
    const hint = bubble.current;
    hint.showPopover();
    const position = () => {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = hint.offsetWidth;
      const height = hint.offsetHeight;
      const side =
        placement === 'right' && rect.right + width + 8 > window.innerWidth - 8
          ? 'left'
          : placement === 'top' && rect.top - height - 8 < 8
            ? 'bottom'
            : placement === 'bottom' && rect.bottom + height + 8 > window.innerHeight - 8
              ? 'top'
              : placement;
      const left =
        side === 'left'
          ? rect.left - width - 8
          : side === 'right'
            ? rect.right + 9
            : rect.left + (rect.width - width) / 2;
      const top =
        side === 'top'
          ? rect.top - height - 8
          : side === 'right' || side === 'left'
            ? rect.top + (rect.height - height) / 2
            : rect.bottom + 8;
      hint.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
      hint.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(hint);
    return () => {
      observer.disconnect();
      if (hint.matches(':popover-open')) hint.hidePopover();
    };
  }, [visible, placement, content]);

  useEffect(() => {
    if (!visible && !waiting) return;
    const dismiss = () => {
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      if (bubble.current?.contains(document.activeElement)) {
        focusWithoutTooltip(anchor.current?.firstElementChild as HTMLElement | null);
      }
      pinned.current = false;
      setWaiting(false);
      setOpen(false);
    };
    if (disabled) {
      dismiss();
      return;
    }
    // Focus scrolls before React opens the hint, but its scroll event can arrive later.
    // Only dismiss when the scroller has actually moved since this hint opened.
    const scrollPositions = new Map<EventTarget, { left: number; top: number }>();
    for (let parent = anchor.current?.parentElement; parent; parent = parent.parentElement) {
      scrollPositions.set(parent, { left: parent.scrollLeft, top: parent.scrollTop });
    }
    const documentScroller = document.scrollingElement;
    if (documentScroller) {
      scrollPositions.set(document, {
        left: documentScroller.scrollLeft,
        top: documentScroller.scrollTop,
      });
    }
    const outsideActivation = (event: Event) => {
      if (
        event.target instanceof Node &&
        (bubble.current?.contains(event.target) ||
          (toggleOnClick && anchor.current?.contains(event.target)))
      )
        return;
      dismiss();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && bubble.current?.contains(event.target)) return;
      if (event.type === 'scroll' && event.target) {
        const previous = scrollPositions.get(event.target);
        const current = event.target === document ? documentScroller : event.target;
        if (
          previous &&
          current instanceof Element &&
          current.scrollLeft === previous.left &&
          current.scrollTop === previous.top
        )
          return;
      }
      dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (visible) {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss();
    };
    const hide = () => {
      if (document.hidden) dismiss();
    };
    document.addEventListener(dismissTooltipEvent, dismiss);
    document.addEventListener('pointerdown', outsideActivation, true);
    document.addEventListener('click', outsideActivation, true);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('wheel', scroll, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener(dismissTooltipEvent, dismiss);
      document.removeEventListener('pointerdown', outsideActivation, true);
      document.removeEventListener('click', outsideActivation, true);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', scroll, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
    };
  }, [visible, waiting, disabled, toggleOnClick]);

  function show(immediate = false) {
    clearTimeout(closeTimer.current);
    if (disabled || pinned.current) return;
    if (visible) return;
    clearTimeout(openTimer.current);
    dismissTooltips();
    if (immediate || openDelay <= 0) {
      setWaiting(false);
      setOpen(true);
    } else {
      setWaiting(true);
      openTimer.current = setTimeout(() => {
        setWaiting(false);
        setOpen(true);
      }, openDelay);
    }
  }

  function activate() {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    activated.current = true;
    setWaiting(false);
    setOpen(false);
  }

  const hint = visible && (
    <span
      className={`tooltip-bubble ${detailed ? 'tooltip-detailed' : ''}`}
      role="tooltip"
      id={id}
      ref={bubble}
      popover="manual"
      tabIndex={detailed ? -1 : undefined}
    >
      {content}
    </span>
  );
  return (
    <span
      ref={anchor}
      className={`tooltip-anchor tooltip-${placement} ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        activated.current = false;
        show();
      }}
      onPointerLeave={() => {
        if (pinned.current) return;
        clearTimeout(openTimer.current);
        setWaiting(false);
        clearTimeout(closeTimer.current);
        if (detailed) closeTimer.current = setTimeout(() => setOpen(false), 160);
        else setOpen(false);
      }}
      onFocus={() => {
        if (!activated.current && !isAutomaticFocus()) show(true);
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        clearTimeout(closeTimer.current);
        clearTimeout(openTimer.current);
        activated.current = false;
        pinned.current = false;
        setWaiting(false);
        setOpen(false);
      }}
      onKeyDown={(event) => {
        const element = bubble.current;
        if (!visible || !detailed || !element || element.scrollHeight <= element.clientHeight)
          return;
        const page = element.clientHeight * 0.8;
        const target =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? element.scrollHeight
              : event.key === 'PageDown'
                ? element.scrollTop + page
                : event.key === 'PageUp'
                  ? element.scrollTop - page
                  : event.key === 'ArrowDown'
                    ? element.scrollTop + 40
                    : event.key === 'ArrowUp'
                      ? element.scrollTop - 40
                      : null;
        if (target === null) return;
        event.preventDefault();
        event.stopPropagation();
        element.scrollTo({ top: target, behavior: 'instant' });
      }}
      onPointerDownCapture={
        toggleOnClick
          ? undefined
          : (event) => {
              if (!(event.target instanceof Node) || !bubble.current?.contains(event.target))
                activate();
            }
      }
      onClickCapture={(event) => {
        if (event.target instanceof Node && bubble.current?.contains(event.target)) return;
        if (!toggleOnClick) {
          activate();
          return;
        }
        const next = !pinned.current;
        clearTimeout(openTimer.current);
        setWaiting(false);
        dismissTooltips();
        activated.current = true;
        pinned.current = next;
        setOpen(next);
      }}
    >
      {cloneElement(children, {
        'aria-describedby': visible
          ? [children.props['aria-describedby'], id].filter(Boolean).join(' ')
          : children.props['aria-describedby'],
        'aria-expanded': toggleOnClick ? visible : children.props['aria-expanded'],
      })}
      {hint}
    </span>
  );
}
