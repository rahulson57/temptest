import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { StoryCard } from '@/components/ui/StoryCard';
import { getCurrentUser } from '@/lib/auth';
import { pageParams } from '@/lib/pagination';
import { listBookmarkedStories } from '@/server/social/bookmarks';

export const metadata: Metadata = {
  title: 'Reading list',
  description: 'Stories you saved to read later.',
};

type PageProps = {
  searchParams: Promise<{ cursor?: string; limit?: string }>;
};

/**
 * /reading-list — the signed-in reader's saved stories.
 *
 * ORDERED BY WHEN YOU SAVED IT, not when it was published. This is a queue the
 * reader built; the thing they saved a minute ago belongs on top even if it was
 * published in 2019.
 *
 * Signed out → /login?next=/reading-list. Middleware already covers this prefix,
 * but the page re-checks: middleware is a first gate, not the boundary.
 */
export default async function ReadingListPage({ searchParams }: PageProps) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/login?next=%2Freading-list');

  const query = await searchParams;
  const stories = await listBookmarkedStories(viewer.id, pageParams(query));

  return (
    <Container className="py-12">
      <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Reading list</h1>
      <p className="mt-3 text-ink-muted">Stories you saved, most recently saved first.</p>

      <section aria-label="Saved stories" className="mt-8">
        {stories.items.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            description="Tap Save on any story and it will wait for you here."
            action={<ButtonLink href="/">Find something to read</ButtonLink>}
          />
        ) : (
          <ul>
            {stories.items.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} variant="compact" />
              </li>
            ))}
          </ul>
        )}

        <Pagination
          nextCursor={stories.nextCursor}
          basePath="/reading-list"
          label="Reading list pagination"
        />
      </section>
    </Container>
  );
}
