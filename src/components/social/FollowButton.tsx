import type { FollowButtonProps } from '@/lib/types';

/**
 * STUB — see src/components/social/ClapButton.tsx for the contract rules.
 * CONTRACT: FollowButtonProps in src/lib/types.ts.
 */
export function FollowButton({ initialFollowing }: FollowButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-pressed={initialFollowing}
      title="Following is coming soon"
      aria-label={
        initialFollowing
          ? 'You follow this writer. Unfollowing is not available yet.'
          : 'Follow this writer. Not available yet.'
      }
      className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-ink-muted opacity-60"
    >
      {initialFollowing ? 'Following' : 'Follow'}
    </button>
  );
}

export default FollowButton;
