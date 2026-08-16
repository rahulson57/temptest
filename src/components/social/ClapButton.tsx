import type { ClapButtonProps } from '@/lib/types';

/**
 * STUB — owned by FOUNDATIONS only until the Social vertical lands.
 *
 * CONTRACT: ClapButtonProps in src/lib/types.ts. The Social vertical replaces
 * this file's implementation behind the SAME props; the Reading vertical
 * imports it today and must not change when the real one arrives.
 *
 * Renders a disabled, accessible control: it announces the real clap count and
 * says why it can't be used yet, rather than silently doing nothing on click.
 */
export function ClapButton({ initialCount, initialUserCount, maxPerUser }: ClapButtonProps) {
  const atLimit = initialUserCount >= maxPerUser;

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Claps are coming soon"
      aria-label={`${initialCount} claps. Clapping is not available yet.`}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm text-ink-muted opacity-60"
    >
      <span aria-hidden="true">👏</span>
      <span>{initialCount}</span>
      {atLimit ? <span className="sr-only">You have given the maximum claps.</span> : null}
    </button>
  );
}

export default ClapButton;
