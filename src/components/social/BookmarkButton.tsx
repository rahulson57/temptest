import type { BookmarkButtonProps } from '@/lib/types';

/**
 * STUB — see src/components/social/ClapButton.tsx for the contract rules.
 * CONTRACT: BookmarkButtonProps in src/lib/types.ts.
 */
export function BookmarkButton({ initialBookmarked }: BookmarkButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-pressed={initialBookmarked}
      title="Bookmarks are coming soon"
      aria-label={
        initialBookmarked
          ? 'Saved to your reading list. Editing is not available yet.'
          : 'Save to reading list. Not available yet.'
      }
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm text-ink-muted opacity-60"
    >
      <span aria-hidden="true">{initialBookmarked ? '🔖' : '📑'}</span>
      <span aria-hidden="true">{initialBookmarked ? 'Saved' : 'Save'}</span>
    </button>
  );
}

export default BookmarkButton;
