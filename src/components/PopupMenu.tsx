import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { dismissPopupEvent, dismissPopups, focusWithoutTooltip } from '../lib/overlays';
import { Tooltip } from './Tooltip';

export function PopupMenu({
  label,
  icon,
  children,
  className,
  triggerClassName,
  menuClassName,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  className: string;
  triggerClassName: string;
  menuClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last' | null>(null);
  const id = useId();

  function items() {
    return Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    );
  }

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const dismissAndRestore = () => {
      if (menu.current?.contains(document.activeElement)) focusWithoutTooltip(trigger.current);
      dismiss();
    };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) dismiss();
    };
    const outsideScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target))
        dismissAndRestore();
    };
    const hide = () => {
      if (document.hidden) dismissAndRestore();
    };
    document.addEventListener(dismissPopupEvent, dismissAndRestore);
    // Capture runs before React Flow and node buttons stop propagation.
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('scroll', outsideScroll, true);
    document.addEventListener('wheel', outsideScroll, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', dismissAndRestore);
    window.addEventListener('resize', dismissAndRestore);
    if (initialFocus.current) {
      const enabled = items();
      (initialFocus.current === 'first' ? enabled[0] : enabled.at(-1))?.focus();
      initialFocus.current = null;
    }
    return () => {
      document.removeEventListener(dismissPopupEvent, dismissAndRestore);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('scroll', outsideScroll, true);
      document.removeEventListener('wheel', outsideScroll, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', dismissAndRestore);
      window.removeEventListener('resize', dismissAndRestore);
    };
  }, [open]);

  function show(focus: 'first' | 'last' | null) {
    dismissPopups();
    initialFocus.current = focus;
    setOpen(true);
  }

  return (
    <div
      className={className}
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          focusWithoutTooltip(trigger.current);
          return;
        }
        const onTrigger = event.target === trigger.current;
        if (onTrigger && !open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          show(event.key === 'ArrowDown' ? 'first' : 'last');
          return;
        }
        if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const enabled = items();
        if (!enabled.length) return;
        const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? enabled.length - 1
              : event.key === 'ArrowDown'
                ? (index + 1) % enabled.length
                : index < 0
                  ? enabled.length - 1
                  : (index - 1 + enabled.length) % enabled.length;
        enabled[next]?.focus();
      }}
    >
      <Tooltip content={label} disabled={open}>
        <button
          type="button"
          className={triggerClassName}
          ref={trigger}
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={(event) => {
            if (open) setOpen(false);
            else show(event.detail === 0 ? 'first' : null);
          }}
        >
          {icon}
        </button>
      </Tooltip>
      {open && (
        <div
          className={menuClassName}
          ref={menu}
          id={id}
          role="group"
          data-keyboard-navigation="true"
          aria-label={label}
          onClick={(event) => {
            if (
              !(event.target instanceof Element) ||
              !event.target.closest('button:not(:disabled)')
            )
              return;
            // Return before React unmounts the item, so a following dialog remembers a live trigger.
            if (
              menu.current?.contains(document.activeElement) &&
              !document.querySelector('dialog[open]')
            ) {
              focusWithoutTooltip(trigger.current);
            }
            setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
