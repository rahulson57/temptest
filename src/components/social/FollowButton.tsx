'use client';

import type { FollowButtonProps } from '@/lib/types';
import { ToggleButton } from './ToggleButton';

/**
 * Follow a writer.
 *
 * CONTRACT: FollowButtonProps in src/lib/types.ts — frozen. `userId` is the
 * user BEING followed, never the viewer.
 *
 * `initialFollowing` comes from StoryDetail.viewerIsFollowingAuthor on a story
 * page, or from the profile loader on /u/[handle]. The server rejects a
 * self-follow with 400; the surfaces that render this simply do not render it on
 * your own profile, so that 400 is a backstop rather than a path users meet.
 */
export function FollowButton({ userId, initialFollowing }: FollowButtonProps) {
  return (
    <ToggleButton
      endpoint={`/api/social/follow/${encodeURIComponent(userId)}`}
      initialOn={initialFollowing}
      labels={['Follow', 'Following']}
      ariaLabels={['Follow this writer', 'Unfollow this writer']}
      announcements={['You are not following this writer', 'You are following this writer']}
    />
  );
}

export default FollowButton;
