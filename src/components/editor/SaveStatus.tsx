'use client';

import { cn } from '@/lib/cn';

/**
 * The autosave indicator.
 *
 * WHY aria-live="polite" AND NOT role="alert": autosave fires every couple of
 * seconds while someone is writing. An assertive region would interrupt the
 * screen reader mid-sentence on every save, which is worse than no announcement
 * at all. "polite" queues the update until the user pauses.
 *
 * The element is ALWAYS rendered, even when idle. A live region that is added
 * to the DOM at the same moment its text changes is frequently not announced —
 * the region has to exist before the mutation for the observer to fire.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type SaveStatusProps = {
  state: SaveState;
  /** Server message when `state` is 'error'. */
  error?: string | null;
  /** ISO timestamp of the last successful save, for the "Saved" label. */
  savedAt?: string | null;
  className?: string;
};

const LABELS: Record<SaveState, string> = {
  idle: 'Draft not saved yet',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
};

export function SaveStatus({ state, error, savedAt, className }: SaveStatusProps) {
  const label = state === 'error' && error ? `Could not save: ${error}` : LABELS[state];

  return (
    <p
      // role="status" implies aria-live="polite"; both are set explicitly
      // because some older screen readers honour only one of them.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'text-sm tabular-nums',
        state === 'error' ? 'text-danger' : 'text-ink-subtle',
        className,
      )}
    >
      <span aria-hidden="true" className="mr-1.5">
        {state === 'saving' ? '◌' : state === 'saved' ? '✓' : state === 'error' ? '!' : '·'}
      </span>
      {label}
      {state === 'saved' && savedAt ? (
        <span className="sr-only"> at {new Date(savedAt).toLocaleTimeString()}</span>
      ) : null}
    </p>
  );
}

export default SaveStatus;
