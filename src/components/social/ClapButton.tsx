'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import type { ClapButtonProps } from '@/lib/types';
import { redirectToLogin, socialRequest } from './social-client';

type ClapResponse = {
  storyTotal: number;
  userCount: number;
  maxPerUser: number;
  clamped: boolean;
};

/**
 * Multi-clap control.
 *
 * CONTRACT: ClapButtonProps in src/lib/types.ts — frozen. Reading and Discovery
 * import this concurrently; the implementation may change, the props may not.
 *
 * A clap is not a like: a reader may clap up to `maxPerUser` (50) times, so the
 * button stays live and accumulates. Each tap optimistically increments and then
 * reconciles against the server's authoritative totals, because the server
 * CLAMPS at the ceiling — the optimistic guess is right 49 times out of 50 and
 * the 50th correction is invisible.
 *
 * NO LAYOUT SHIFT: the count sits in a fixed-min-width, tabular-nums slot, so
 * 9 → 10 → 100 does not reflow the surrounding byline.
 */
export function ClapButton({
  storyId,
  initialCount,
  initialUserCount,
  maxPerUser,
}: ClapButtonProps) {
  const ceiling = maxPerUser > 0 ? maxPerUser : 0;

  const [total, setTotal] = useState(initialCount);
  const [userCount, setUserCount] = useState(initialUserCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atLimit = userCount >= ceiling;

  function clap() {
    if (atLimit) return;

    // Optimistic: the server is authoritative and corrects us below.
    const optimisticTotal = total + 1;
    const optimisticUser = Math.min(userCount + 1, ceiling);
    setTotal(optimisticTotal);
    setUserCount(optimisticUser);
    setError(null);

    startTransition(async () => {
      const result = await socialRequest<ClapResponse>(
        `/api/social/clap/${encodeURIComponent(storyId)}`,
        'POST',
        { count: 1 },
      );

      if (result.kind === 'unauthenticated') {
        redirectToLogin();
        return;
      }
      if (result.kind === 'error') {
        setTotal(total);
        setUserCount(userCount);
        setError(result.message);
        return;
      }
      setTotal(result.data.storyTotal);
      setUserCount(result.data.userCount);
    });
  }

  const label = atLimit
    ? `${total} ${plural(total)}. You have given the maximum of ${ceiling} claps.`
    : `Clap for this story. ${total} ${plural(total)}. You have given ${userCount}.`;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={clap}
        disabled={atLimit}
        aria-label={label}
        // Explains the disabled state rather than leaving a dead control.
        title={atLimit ? `You have given the maximum of ${ceiling} claps` : 'Clap for this story'}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-60',
          userCount > 0 ? 'bg-surface text-ink' : 'text-ink-muted hover:bg-surface hover:text-ink',
        )}
      >
        <span aria-hidden="true">👏</span>
        {/* Fixed slot: the number changes, the box does not. */}
        <span aria-hidden="true" className="min-w-[2ch] text-right tabular-nums">
          {total}
        </span>
      </button>

      {/* Announced on change; visually hidden because the count above is visible. */}
      <span aria-live="polite" className="sr-only">
        {`${total} ${plural(total)}${userCount > 0 ? `, ${userCount} from you` : ''}`}
      </span>

      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}

      {pending ? <span className="sr-only">Saving your clap…</span> : null}
    </div>
  );
}

function plural(count: number): string {
  return count === 1 ? 'clap' : 'claps';
}

export default ClapButton;
