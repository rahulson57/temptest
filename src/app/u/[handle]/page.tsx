import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { FollowButton } from '@/components/social/FollowButton';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { StoryCard } from '@/components/ui/StoryCard';
import { getCurrentUser } from '@/lib/auth';
import { isAppError } from '@/lib/errors';
import { pageParams } from '@/lib/pagination';
import { getProfileByHandle, loadProfile } from '@/server/profiles/profiles';

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ cursor?: string; limit?: string }>;
};

/**
 * /u/[handle] — a writer's public profile. SERVER-RENDERED.
 *
 * Server-rendered is a requirement, not a preference: a profile is a page other
 * people link to and search engines index, so the writer's name, bio and story
 * list must be in the HTML rather than assembled after a client fetch.
 *
 * PUBLISHED STORIES ONLY. The filter lives in listPublishedStoriesByAuthor(),
 * not in this component, so "a visitor cannot read someone's drafts" is a claim
 * a unit test can make about a function instead of an assertion about JSX.
 *
 * Unknown handle → 404, via notFound(). An unknown profile is genuinely missing;
 * rendering an empty shell would tell a crawler the page exists.
 */
export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const query = await searchParams;

  const viewer = await getCurrentUser();

  const data = await loadProfile(handle, viewer?.id ?? null, pageParams(query)).catch(
    (error: unknown) => {
      if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
      throw error;
    },
  );

  const { profile, stories } = data;
  const canFollow = viewer !== null && !profile.isViewer;

  return (
    <Container className="py-12">
      <header className="flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
              {profile.displayName}
            </h1>
            <p className="mt-1 text-ink-muted">@{profile.handle}</p>
            {profile.bio ? (
              <p className="mt-4 max-w-prose leading-relaxed text-ink">{profile.bio}</p>
            ) : null}

            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span>
                <span className="font-medium text-ink">{profile.followerCount}</span>{' '}
                {profile.followerCount === 1 ? 'follower' : 'followers'}
              </span>
              <span>
                <span className="font-medium text-ink">{profile.followingCount}</span> following
              </span>
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {profile.isViewer ? (
            <ButtonLink href="/settings" variant="secondary" size="sm">
              Edit profile
            </ButtonLink>
          ) : canFollow ? (
            <FollowButton userId={profile.id} initialFollowing={profile.viewerIsFollowing} />
          ) : (
            // Signed out: a real link to sign in, never a dead disabled control.
            <Link
              href={`/login?next=${encodeURIComponent(`/u/${profile.handle}`)}`}
              className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign in to follow
            </Link>
          )}
        </div>
      </header>

      <section aria-label={`Stories by ${profile.displayName}`} className="mt-4">
        {stories.items.length === 0 ? (
          <EmptyState
            className="mt-10"
            title={
              profile.isViewer ? 'You haven’t published anything yet' : 'No published stories yet'
            }
            description={
              profile.isViewer
                ? 'Drafts stay private until you publish them.'
                : `When ${profile.displayName} publishes something, it will appear here.`
            }
            action={profile.isViewer ? <ButtonLink href="/write">Start writing</ButtonLink> : null}
          />
        ) : (
          <ul>
            {stories.items.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} />
              </li>
            ))}
          </ul>
        )}

        {/* Cursor pagination is forward-only by design (src/lib/pagination.ts):
            there is no offset to walk back to, so no "Newer" link is offered. */}
        <Pagination
          nextCursor={stories.nextCursor}
          basePath={`/u/${profile.handle}`}
          label="Stories pagination"
        />
      </section>
    </Container>
  );
}

/** Title/description from the profile itself, so shared links read properly. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  try {
    const user = await getProfileByHandle(handle);
    return {
      title: `${user.displayName} (@${user.handle})`,
      description: user.bio ?? `Stories by ${user.displayName} on Quill.`,
    };
  } catch {
    return { title: 'Profile not found' };
  }
}
