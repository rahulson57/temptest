'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import { redirectToLogin, socialRequest } from './social-client';

/**
 * The shared body of every on/off social control (bookmark, follow, follow-tag).
 *
 * Those three differ only in their endpoint and their words. Sharing the
 * mechanism keeps one implementation of the parts that are easy to get subtly
 * wrong in three places: optimistic update with rollback, aria-pressed, the
 * polite live region, and the 401 → /login hand-off.
 *
 * NOT exported through the frozen contract — this is an internal detail of
 * src/components/social/. The three public components keep their exact props
 * from src/lib/types.ts.
 */

export type ToggleButtonProps = {
  /** Endpoint hit with POST to turn on and DELETE to turn off. */
  endpoint: string;
  initialOn: boolean;
  /** Visible text: [when off, when on]. */
  labels: [string, string];
  /** Full aria-label for each state — say what the button DOES, not just its name. */
  ariaLabels: [string, string];
  /** Announced politely after a successful toggle. */
  announcements: [string, string];
  size?: 'sm' | 'md';
  className?: string;
};

export function ToggleButton({
  endpoint,
  initialOn,
  labels,
  ariaLabels,
  announcements,
  size = 'md',
  className,
}: ToggleButtonProps) {
  const [on, setOn] = useState(initialOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    const previous = on;
    setOn(next);
    setError(null);

    startTransition(async () => {
      const result = await socialRequest(endpoint, next ? 'POST' : 'DELETE');

      if (result.kind === 'unauthenticated') {
        setOn(previous);
        redirectToLogin();
        return;
      }
      if (result.kind === 'error') {
        setOn(previous);
        setError(result.message);
      }
      // Success: the optimistic state was already correct. Both verbs are
      // idempotent server-side, so a retry cannot desynchronise us.
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        // aria-pressed is what makes this a TOGGLE to a screen reader rather
        // than a button whose label happens to change.
        aria-pressed={on}
        aria-label={on ? ariaLabels[1] : ariaLabels[0]}
        className={cn(
          'inline-flex items-center justify-center rounded-full border font-medium',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-60',
          // Both labels share one box, so toggling never reflows the row.
          size === 'sm' ? 'h-8 min-w-[7.5rem] px-3 text-sm' : 'h-9 min-w-[8.5rem] px-4 text-sm',
          on
            ? 'border-border bg-surface text-ink'
            : 'border-border bg-canvas text-ink-muted hover:bg-surface hover:text-ink',
          className,
        )}
      >
        {on ? labels[1] : labels[0]}
      </button>

      <span aria-live="polite" className="sr-only">
        {on ? announcements[1] : announcements[0]}
      </span>

      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}

      {pending ? <span className="sr-only">Saving…</span> : null}
    </span>
  );
}

export default ToggleButton;
