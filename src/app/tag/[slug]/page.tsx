import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { StoryList } from '@/components/feed/StoryList';
import { FollowTagButton } from '@/components/social/FollowTagButton';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { pageParams } from '@/lib/pagination';
import { tagArchive } from '@/server/feed/queries';

/**
 * TAG ARCHIVE — /tag/[slug]
 *
 * Published stories carrying the tag, newest first, cursor-paginated, with the
 * archive's total story count and a follow affordance.
 *
 * <FollowTagButton> comes from the Social vertical (currently a typed stub).
 * It is imported, never edited: the props contract lives in src/lib/types.ts
 * and Social swaps the implementation in behind it. This page's only job is to
 * resolve `initialFollowing` correctly, which `tagArchive` does in the same
 * fixed set of queries as everything else on the page.
 *
 * An unknown slug is a 404 via notFound(), not an empty archive — a tag that
 * does not exist and a tag with no stories are different answers.
 */

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await prisma.tag.findUnique({ where: { slug }, select: { name: true } });
  if (!tag) return { title: 'Topic not found — Quill' };
  return {
    title: `${tag.name} — Quill`,
    description: `Stories about ${tag.name} on Quill.`,
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const { cursor } = await searchParams;

  const viewer = await getCurrentUser();
  const archive = await tagArchive(slug, pageParams({ cursor }), { viewerId: viewer?.id ?? null });

  if (!archive) notFound();

  const { tag, storyCount, page } = archive;

  return (
    <Container className="py-10">
      <header className="border-b border-border pb-6">
        <p className="text-sm uppercase tracking-wide text-ink-subtle">Topic</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-serif text-3xl font-bold leading-tight text-ink sm:text-4xl">
            {tag.name}
          </h1>
          <FollowTagButton tagId={tag.id} initialFollowing={tag.viewerIsFollowing} />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {storyCount === 1 ? '1 published story' : `${storyCount} published stories`}
        </p>
      </header>

      <StoryList
        stories={page.items}
        label={`Stories tagged ${tag.name}`}
        emptyTitle={`Nothing published under ${tag.name} yet`}
        emptyDescription="This topic exists, but no published story carries it right now."
        emptyAction={<ButtonLink href="/">Back to the feed</ButtonLink>}
      />

      <Pagination
        nextCursor={page.nextCursor}
        basePath={`/tag/${tag.slug}`}
        label="Topic pagination"
      />
    </Container>
  );
}
