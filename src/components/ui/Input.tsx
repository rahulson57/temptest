'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  /** Required: every input gets a real <label>. Use `hideLabel` for visual-only omission. */
  label: string;
  id?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
};

/**
 * Labelled text input.
 *
 * `label` is a required prop rather than optional-with-aria-label: placeholder-
 * as-label fails for screen readers and disappears the moment a user types.
 * Errors are wired with aria-describedby + aria-invalid so they are announced.
 */
export function Input({
  label,
  id,
  hint,
  error,
  hideLabel = false,
  className,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn(
          'text-sm font-medium text-ink',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}

      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          'h-10 w-full rounded-md border bg-canvas px-3 text-sm text-ink',
          'placeholder:text-ink-subtle',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...rest}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default Input;
