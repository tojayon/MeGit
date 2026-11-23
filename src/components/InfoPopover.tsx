import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Info, X } from 'lucide-react';
import {
  dismissPopupEvent,
  dismissPopups,
  focusWithoutTooltip,
  withoutFocusTooltip,
} from '../lib/overlays';
import { Tooltip } from './Tooltip';
import { IconButton } from './IconButton';

export function InfoPopover({
  label,
  help,
  children,
  triggerContent,
  triggerLabel,
  triggerClassName,
  panelClassName,
  titleIcon,
  titleDetail,
  placement = 'bottom',
  onOpen,
  onClose,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
  triggerContent?: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  panelClassName?: string;
  titleIcon?: ReactNode;
  titleDetail?: ReactNode;
  placement?: 'top' | 'bottom' | 'right';
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(
    (restore = false) => {
      if (restore && panel.current?.contains(document.activeElement))
        focusWithoutTooltip(trigger.current);
      setOpen(false);
      onClose?.();
    },
    [onClose],
  );

  useLayoutEffect(() => {
    const element = panel.current;
    const button = trigger.current;
    if (!open || !element || !button) return;
    element.showPopover();
    const position = () => {
      const rect = button.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = element;
      const limit = innerWidth - width - 8;
      const side = placement === 'right' && rect.right + 8 <= limit ? rect.right + 8 : null;
      const left =
        side ?? Math.max(8, Math.min(placement === 'top' ? rect.left : rect.right - width, limit));
      const top =
        side !== null
          ? Math.max(8, Math.min(rect.top, innerHeight - height - 8))
          : placement !== 'top' && rect.bottom + height + 8 <= innerHeight - 8
            ? rect.bottom + 8
            : Math.max(8, rect.top - height - 8);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    };
    position();
    const observer = placement === 'bottom' ? null : new ResizeObserver(position);
    observer?.observe(element);
    focusWithoutTooltip(element);
    return () => {
      observer?.disconnect();
      withoutFocusTooltip(() => {
        if (element.matches(':popover-open')) element.hidePopover();
      });
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => close(true);
    const outside = (event: Event) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close();
    };
    const scroll = (event: Event) => {
      const target = event.target;
      if (event.type === 'wheel') {
        if (!(target instanceof Node) || !panel.current?.contains(target)) dismiss();
      } else if (target instanceof Node && target.contains(trigger.current)) {
        dismiss();
      }
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
  }, [open, close]);

  return (
    <div
      className="info-popover-anchor"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <Tooltip
        content={help ?? label}
        detailed={help !== undefined}
        disabled={open}
        placement={placement === 'top' ? 'top' : undefined}
      >
        <button
          ref={trigger}
          type="button"
          className={triggerClassName ?? 'icon-button'}
          aria-label={triggerLabel ?? label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            if (open) close();
            else {
              dismissPopups();
              onOpen?.();
              setOpen(true);
            }
          }}
        >
          {triggerContent ?? <Info size={17} aria-hidden="true" />}
        </button>
      </Tooltip>
      {open && (
        <div
          ref={panel}
          id={id}
          popover="manual"
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          className={panelClassName ? `info-popover ${panelClassName}` : 'info-popover'}
        >
          <header>
            {titleIcon || titleDetail ? (
              <div className="info-popover-title">
                {titleIcon}
                <h3 id={`${id}-title`}>{label}</h3>
                {titleDetail}
              </div>
            ) : (
              <h3 id={`${id}-title`}>{label}</h3>
            )}
            <IconButton label={t('common.close', { name: label })} onClick={() => close(true)}>
              <X size={16} />
            </IconButton>
          </header>
          <div className="info-popover-body">{children}</div>
        </div>
      )}
    </div>
  );
}
