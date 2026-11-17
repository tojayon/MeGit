export const dismissTooltipEvent = 'megit:dismiss-tooltips';
export const dismissPopupEvent = 'megit:dismiss-popups';

let automaticFocus = false;

export function isAutomaticFocus() {
  return automaticFocus;
}

// Native dialog.showModal()/close() also move focus synchronously.
export function withoutFocusTooltip(action: () => void) {
  const previous = automaticFocus;
  automaticFocus = true;
  try {
    action();
  } finally {
    automaticFocus = previous;
  }
}

export function focusWithoutTooltip(element: HTMLElement | null | undefined) {
  withoutFocusTooltip(() => element?.focus({ preventScroll: true }));
}

export function dismissTooltips() {
  document.dispatchEvent(new Event(dismissTooltipEvent));
}

export function dismissPopups() {
  dismissTooltips();
  document.dispatchEvent(new Event(dismissPopupEvent));
}
