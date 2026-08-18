'use client';

import type { BookmarkButtonProps } from '@/lib/types';
import { ToggleButton } from './ToggleButton';

/**
 * Save a story to the reading list.
 *
 * CONTRACT: BookmarkButtonProps in src/lib/types.ts — frozen.
 *
 * `initialBookmarked` is resolved once by whoever loads the story
 * (StoryDetail.viewerHasBookmarked), so the first paint is already correct and
 * this control never fetches its own state.
 */
export function BookmarkButton({ storyId, initialBookmarked }: BookmarkButtonProps) {
  return (
    <ToggleButton
      endpoint={`/api/social/bookmark/${encodeURIComponent(storyId)}`}
      initialOn={initialBookmarked}
      labels={['Save', 'Saved']}
      ariaLabels={['Save this story to your reading list', 'Remove this story from your reading list']}
      announcements={['Not in your reading list', 'Saved to your reading list']}
    />
  );
}

export default BookmarkButton;
