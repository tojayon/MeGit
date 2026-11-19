import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  dismissPopupEvent,
  dismissPopups,
  focusWithoutTooltip,
  withoutFocusTooltip,
} from '../lib/overlays';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import './navigation-flyout.css';

export function NavigationFlyout({
  label,
  icon,
  actions,
  children,
}: {
  label: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);

  function close() {
    setOpen(false);
  }

  function show(keyboard = false) {
    dismissPopups();
    focusFirst.current = keyboard;
    setOpen(true);
  }

  useLayoutEffect(() => {
    const element = panel.current;
    const anchor = trigger.current;
    if (!open || !element || !anchor) return;
    element.showPopover();
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const right =
        anchor.closest('.workspace-navigation')?.getBoundingClientRect().right || rect.right;
      element.style.left = `${Math.max(8, Math.min(right + 8, innerWidth - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - element.offsetHeight - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    focusWithoutTooltip(
      focusFirst.current
        ? element.querySelector<HTMLElement>('.navigation-flyout-body button:not(:disabled)') ||
            element
        : element,
    );
    return () => {
      observer.disconnect();
      withoutFocusTooltip(() => {
        if (element.matches(':popover-open')) element.hidePopover();
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollPositions = new Map<EventTarget, { left: number; top: number }>();
    for (let ancestor = trigger.current?.parentElement; ancestor; ancestor = ancestor.parentElement)
      scrollPositions.set(ancestor, { left: ancestor.scrollLeft, top: ancestor.scrollTop });
    const documentScroller = document.scrollingElement;
    if (documentScroller)
      scrollPositions.set(document, {
        left: documentScroller.scrollLeft,
        top: documentScroller.scrollTop,
      });
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
      if (event.type === 'scroll' && event.target) {
        const previous = scrollPositions.get(event.target);
        const current = event.target === document ? documentScroller : event.target;
        // Ignore a late notification from scrolling the opener into view before it was clicked.
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
    const hide = () => {
      if (document.hidden) dismiss();
    };
    document.addEventListener(dismissPopupEvent, dismiss);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('wheel', scroll, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener(dismissPopupEvent, dismiss);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', scroll, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [open]);

  return (
    <div
      className="navigation-flyout-anchor"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          focusWithoutTooltip(trigger.current);
          close();
        } else if (
          event.target === trigger.current &&
          !open &&
          ['ArrowRight', 'ArrowDown'].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          show(true);
        }
      }}
    >
      <Tooltip content={label} placement="right" disabled={open}>
        <button
          ref={trigger}
          type="button"
          className={`navigation-action navigation-flyout-trigger ${open ? 'active' : ''}`}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={(event) => (open ? close() : show(event.detail === 0))}
        >
          {icon}
        </button>
      </Tooltip>
      {open && (
        <div
          ref={panel}
          id={id}
          className="navigation-flyout"
          popover="manual"
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
              if (panel.current?.contains(document.activeElement))
                focusWithoutTooltip(trigger.current);
              close();
            }
          }}
        >
          <header className="navigation-flyout-heading">
            <h2 id={`${id}-title`}>{label}</h2>
            {actions}
            <IconButton label={t('common.close', { name: label })} onClick={() => close()}>
              <X size={16} />
            </IconButton>
          </header>
          <div className="navigation-flyout-body">{children}</div>
        </div>
      )}
    </div>
  );
}
