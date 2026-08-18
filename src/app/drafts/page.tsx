import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { TagList } from '@/components/ui/Tag';
import { getCurrentUser } from '@/lib/auth';
import { formatReadingTime } from '@/lib/readingTime';
import { listOwnDrafts } from '@/server/stories/service';
import type { StoryDto } from '@/server/stories/serialize';

/**
 * /drafts — the signed-in writer's unpublished work.
 *
 * WHY NOT <StoryCard>. The foundations card is built for READERS: it links to
 * the public story URL, shows an author byline and a clap count. None of that
 * is meaningful for a draft, which has no public URL, whose author is the
 * person reading the page, and which nobody can have clapped for. The row
 * below links to the editor instead and is built from the same ui primitives
 * (Tag, Button, EmptyState) so it stays visually of a piece with the rest.
 *
 * Paginated through the shared cursor helper — an author with 400 drafts must
 * not get 400 rows in one response.
 */

export const metadata: Metadata = {
  title: 'Drafts',
  robots: { index: false, follow: false },
};

type DraftsPageProps = {
  searchParams: Promise<{ cursor?: string }>;
};

export default async function DraftsPage({ searchParams }: DraftsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/drafts');

  const { cursor } = await searchParams;
  const page = await listOwnDrafts(user, { cursor: cursor ?? null, limit: 10 });

  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">Drafts</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Everything you have started but not published yet.
          </p>
        </div>
        <ButtonLink href="/write">Start a new story</ButtonLink>
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="No drafts yet"
          description="Anything you start writing shows up here until you publish it."
          action={<ButtonLink href="/write">Write your first story</ButtonLink>}
        />
      ) : (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {page.items.map((draft) => (
            <li key={draft.id}>
              <DraftRow draft={draft} />
            </li>
          ))}
        </ul>
      )}

      <Pagination nextCursor={page.nextCursor} basePath="/drafts" label="Draft pages" />
    </Container>
  );
}

function DraftRow({ draft }: { draft: StoryDto }) {
  return (
    <article className="py-6">
      <h2 className="font-serif text-xl font-semibold text-ink">
        {/*
          The whole row is not a link: the tag chips inside it are their own
          links, and nesting interactive elements is invalid and unusable with a
          keyboard. The title is the one link, which is also what a screen
          reader's link list wants to show.
        */}
        <Link
          href={`/write/${draft.id}`}
          className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {draft.title.trim().length > 0 ? draft.title : 'Untitled draft'}
        </Link>
      </h2>

      {draft.subtitle ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{draft.subtitle}</p>
      ) : draft.excerpt ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{draft.excerpt}</p>
      ) : (
        <p className="mt-1.5 text-sm italic text-ink-subtle">Nothing written yet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-subtle">
        <span>
          Edited{' '}
          <time dateTime={draft.updatedAt}>
            {new Date(draft.updatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </time>
        </span>
        <span aria-hidden="true">·</span>
        <span>{formatReadingTime(draft.readingTimeMinutes)}</span>
        {draft.tags.length > 0 ? (
          <TagList tags={draft.tags} size="sm" className="basis-full sm:basis-auto" />
        ) : null}
      </div>
    </article>
  );
}
