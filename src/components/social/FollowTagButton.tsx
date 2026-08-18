'use client';

import type { FollowTagButtonProps } from '@/lib/types';
import { ToggleButton } from './ToggleButton';

/**
 * Follow a topic.
 *
 * CONTRACT: FollowTagButtonProps in src/lib/types.ts — frozen. Discovery renders
 * this on tag pages, resolving `initialFollowing` from
 * TagSummary.viewerIsFollowing (optional there precisely so feed rows can list
 * tags without paying for the follow lookup).
 */
export function FollowTagButton({ tagId, initialFollowing }: FollowTagButtonProps) {
  return (
    <ToggleButton
      endpoint={`/api/social/follow-tag/${encodeURIComponent(tagId)}`}
      initialOn={initialFollowing}
      labels={['Follow topic', 'Following']}
      ariaLabels={['Follow this topic', 'Unfollow this topic']}
      announcements={['You are not following this topic', 'You are following this topic']}
      size="sm"
    />
  );
}

export default FollowTagButton;
