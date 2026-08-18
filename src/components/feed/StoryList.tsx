import type { ReactNode } from 'react';
import { StoryCard } from '@/components/ui/StoryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StorySummary } from '@/lib/types';

export type StoryListProps = {
  stories: StorySummary[];
  /** Shown instead of the list when there is nothing to show. */
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Accessible name for the list region. */
  label: string;
};

/**
 * A page of stories, or a designed empty state.
 *
 * Every discovery surface (home, tag archive, and the no-results branch of
 * search) renders through this so an empty feed, an empty tag and an empty
 * search all look and read the same way. It is a thin wrapper over the shared
 * <StoryCard> on purpose — the card is foundations-owned and must not be
 * restyled per-vertical.
 */
export function StoryList({
  stories,
  emptyTitle,
  emptyDescription,
  emptyAction,
  label,
}: StoryListProps) {
  if (stories.length === 0) {
    return (
      <div className="py-10">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <ul aria-label={label} className="mt-2">
      {stories.map((story) => (
        <li key={story.id}>
          <StoryCard story={story} />
        </li>
      ))}
    </ul>
  );
}

export default StoryList;
