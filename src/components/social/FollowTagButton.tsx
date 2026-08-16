import type { FollowTagButtonProps } from '@/lib/types';

/**
 * STUB — see src/components/social/ClapButton.tsx for the contract rules.
 * CONTRACT: FollowTagButtonProps in src/lib/types.ts.
 */
export function FollowTagButton({ initialFollowing }: FollowTagButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-pressed={initialFollowing}
      title="Following topics is coming soon"
      aria-label={
        initialFollowing
          ? 'You follow this topic. Unfollowing is not available yet.'
          : 'Follow this topic. Not available yet.'
      }
      className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm text-ink-muted opacity-60"
    >
      {initialFollowing ? 'Following' : 'Follow topic'}
    </button>
  );
}

export default FollowTagButton;
