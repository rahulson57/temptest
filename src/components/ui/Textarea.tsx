'use client';

import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  id?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
};

/** Labelled multi-line input. Same a11y contract as <Input>. */
export function Textarea({
  label,
  id,
  hint,
  error,
  hideLabel = false,
  rows = 4,
  className,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}

      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          'w-full resize-y rounded-md border bg-canvas px-3 py-2 text-sm leading-relaxed text-ink',
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

export default Textarea;
