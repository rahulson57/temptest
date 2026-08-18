import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { normalizeLimit, toPageBy, type Page, type PageParams } from '@/lib/pagination';
import type { StorySummary } from '@/lib/types';
import { STORY_SUMMARY_SELECT, toStorySummaries, type StoryRow } from './story-summary';

/**
 * Bookmarks and the reading list.
 *
 * Like follows, both mutations are idempotent — the composite primary key
 * (userId, storyId) makes a duplicate bookmark impossible, and removing one you
 * never saved is a success, not a 404.
 */

export type BookmarkState = {
  bookmarked: boolean;
};

/** Save a story. Unknown story → 404. Saving twice is a no-op. */
export async function addBookmark(viewerId: string, storyId: string): Promise<BookmarkState> {
  await assertStoryExists(storyId);

  await prisma.bookmark.upsert({
    where: { userId_storyId: { userId: viewerId, storyId } },
    create: { userId: viewerId, storyId },
    update: {},
  });

  return { bookmarked: true };
}

/** Remove a story from the reading list. Unknown story → 404; absent row → ok. */
export async function removeBookmark(viewerId: string, storyId: string): Promise<BookmarkState> {
  await assertStoryExists(storyId);

  // deleteMany rather than delete: delete throws when the row is absent, which
  // would make an idempotent un-bookmark a 500.
  await prisma.bookmark.deleteMany({ where: { userId: viewerId, storyId } });

  return { bookmarked: false };
}

/** Whether the viewer has saved this story (false when signed out). */
export async function hasBookmarked(
  viewerId: string | null | undefined,
  storyId: string,
): Promise<boolean> {
  if (!viewerId) return false;
  const row = await prisma.bookmark.findUnique({
    where: { userId_storyId: { userId: viewerId, storyId } },
    select: { storyId: true },
  });
  return row !== null;
}

/**
 * The viewer's reading list: bookmarked stories, NEWEST BOOKMARK FIRST.
 *
 * Ordering is by when the story was SAVED, not when it was published — the
 * reading list is a queue the reader built, so the thing they just saved has to
 * be on top.
 *
 * Only PUBLISHED stories appear. A story can be unpublished after being saved,
 * and a reading list is not a licence to read someone's draft.
 *
 * The cursor is the last row's storyId, resolved against the composite
 * (userId, storyId) key, so paging is stable while new bookmarks are added.
 */
export async function listBookmarkedStories(
  viewerId: string,
  params: PageParams,
): Promise<Page<StorySummary>> {
  const limit = normalizeLimit(params.limit);

  const rows = await prisma.bookmark.findMany({
    where: { userId: viewerId, story: { status: 'PUBLISHED' } },
    orderBy: [{ createdAt: 'desc' }, { storyId: 'desc' }],
    take: limit + 1, // lookahead row: is there another page?
    ...(params.cursor
      ? { cursor: { userId_storyId: { userId: viewerId, storyId: params.cursor } }, skip: 1 }
      : {}),
    select: { storyId: true, story: { select: STORY_SUMMARY_SELECT } },
  });

  const page = toPageBy(rows, limit, (row) => row.storyId);
  const summaries = await toStorySummaries(page.items.map((row) => row.story as StoryRow));

  return { items: summaries, nextCursor: page.nextCursor };
}

async function assertStoryExists(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true } });
  if (!story) throw new NotFoundError('That story does not exist');
}
