import { cloneElement, useId, type AriaAttributes, type ReactElement } from 'react';

type ControlProps = Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'> & { id?: string };

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<ControlProps>;
}) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [children.props['aria-describedby'], hint && hintId, error && errorId]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function focusFirstError(form: HTMLFormElement) {
  requestAnimationFrame(() => {
    if (!form.isConnected) return;
    form
      .querySelector<HTMLElement>(
        '[aria-invalid="true"] input, input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]',
      )
      ?.focus();
  });
}
