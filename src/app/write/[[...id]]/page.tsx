import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { StoryEditor } from '@/components/editor/StoryEditor';
import { getCurrentUser } from '@/lib/auth';
import { findStoryForEditor } from '@/server/stories/service';

/**
 * /write (new story) and /write/<id> (edit).
 *
 * ONE ROUTE, NOT TWO, because they are the same screen: a new story becomes an
 * existing one the moment autosave fires, and splitting them would mean either
 * a full navigation mid-typing or two copies of the editor to keep in sync. The
 * optional catch-all segment lets `/write` and `/write/<id>` share a file, and
 * StoryEditor rewrites the URL itself after the first save.
 *
 * WHY notFound() FOR SOMEONE ELSE'S STORY. `findStoryForEditor` returns null
 * for both "no such story" and "not yours", and this page renders a 404 for
 * both. A distinct 403 page would confirm that a given id exists — the same
 * enumeration leak the API avoids by checking 404 before 403. The API still
 * answers 403 on mutations, where the caller has already proven they know the
 * id and the honest answer is more useful than a misleading one.
 */

export const metadata: Metadata = {
  title: 'Write',
  robots: { index: false, follow: false },
};

type WritePageProps = {
  params: Promise<{ id?: string[] }>;
};

export default async function WritePage({ params }: WritePageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/write');

  const { id: segments } = await params;

  // /write/<id>/anything-else is not a route this page serves.
  if (segments && segments.length > 1) notFound();

  const storyId = segments?.[0];
  const story = storyId ? await findStoryForEditor(storyId, user) : null;
  if (storyId && !story) notFound();

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="font-serif text-2xl font-bold text-ink">
        {story ? 'Edit story' : 'New story'}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Your work saves automatically a couple of seconds after you stop typing.
      </p>

      <div className="mt-8">
        <StoryEditor story={story} />
      </div>
    </Container>
  );
}
