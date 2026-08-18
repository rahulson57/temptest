import { prisma } from '@/lib/db';
import { emptyPage, prismaPageArgs, type Page, type PageParams } from '@/lib/pagination';
import type { StorySummary } from '@/lib/types';
import type { FeedDb } from './db';
import {
  PUBLISHED_WHERE,
  RECENT_FIRST,
  STORY_SUMMARY_SELECT,
  loadStorySummaries,
  type StoryRow,
} from './select';
import {
  TRENDING_CANDIDATE_LIMIT,
  compareTrending,
  trendingScore,
  trendingWindowStart,
} from './score';

/**
 * The three feeds.
 *
 * INVARIANTS, enforced here rather than at each call site:
 *  1. Only PUBLISHED stories are ever returned — a draft has no route into any
 *     feed, tag archive or search result (tests assert this on every surface).
 *  2. Every result is a cursor page from `@/lib/pagination` (default 10, max
 *     50). There is no "return everything" path.
 *  3. Query count is constant in the page size: no per-story lookups.
 */

export type FeedScope = 'personal' | 'global' | 'trending';

export type FeedPage = Page<StorySummary> & {
  scope: FeedScope;
  /**
   * True when a signed-in reader asked for `personal` and got the global feed
   * instead, because they follow nobody yet (or their follows have published
   * nothing). The UI says so rather than silently pretending it is personal.
   */
  fallback: boolean;
};

/** Global feed: every published story, newest first. */
export async function globalFeed(params: PageParams, db: FeedDb = prisma): Promise<FeedPage> {
  const rows = (await db.story.findMany({
    where: PUBLISHED_WHERE,
    orderBy: RECENT_FIRST,
    select: STORY_SUMMARY_SELECT,
    ...prismaPageArgs(params),
  })) as StoryRow[];

  return { ...(await materialize(rows, params.limit, db)), scope: 'global', fallback: false };
}

/**
 * Personalized feed: stories by authors you follow UNION stories carrying tags
 * you follow, newest first.
 *
 * The union is expressed as a single `OR`, which is also what deduplicates it:
 * a story by a followed author that ALSO carries a followed tag is one row in
 * the result, not two. Doing it as two queries plus a JS merge would break
 * cursor pagination (the merged order is not the SQL order).
 *
 * Falls back to the global feed when the personalized set is empty on the first
 * page — an empty home page is a worse answer than a good general one.
 */
export async function personalFeed(
  userId: string,
  params: PageParams,
  db: FeedDb = prisma,
): Promise<FeedPage> {
  const [follows, tagFollows] = await Promise.all([
    db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    db.tagFollow.findMany({ where: { userId }, select: { tagId: true } }),
  ]);

  const authorIds = follows.map((row) => row.followingId);
  const tagIds = tagFollows.map((row) => row.tagId);

  // Nothing followed at all: skip the query that can only return zero rows.
  if (authorIds.length === 0 && tagIds.length === 0) {
    return { ...(await globalFeed(params, db)), scope: 'personal', fallback: true };
  }

  const rows = (await db.story.findMany({
    where: {
      ...PUBLISHED_WHERE,
      OR: [
        ...(authorIds.length > 0 ? [{ authorId: { in: authorIds } }] : []),
        ...(tagIds.length > 0 ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
      ],
    },
    orderBy: RECENT_FIRST,
    select: STORY_SUMMARY_SELECT,
    ...prismaPageArgs(params),
  })) as StoryRow[];

  // Only the FIRST page falls back. Reaching the end of a real personalized
  // feed on page 3 means "you're all caught up", not "here's everyone else".
  if (rows.length === 0 && !params.cursor) {
    return { ...(await globalFeed(params, db)), scope: 'personal', fallback: true };
  }

  return { ...(await materialize(rows, params.limit, db)), scope: 'personal', fallback: false };
}

/**
 * Trending: recent published stories ranked by `trendingScore` (see score.ts
 * for the formula and why each term is there).
 *
 * Ranking happens in application code because the score is a function of `now`
 * and cannot be an index-friendly SQL ORDER BY. The candidate set is therefore
 * bounded to the newest TRENDING_CANDIDATE_LIMIT published stories, which keeps
 * this O(1) in queries; the pagination cursor then walks the ranked list.
 */
export async function trendingFeed(
  params: PageParams,
  options: { now?: Date; db?: FeedDb } = {},
): Promise<FeedPage> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const windowStart = trendingWindowStart(now);

  const candidates = (await db.story.findMany({
    where: PUBLISHED_WHERE,
    orderBy: RECENT_FIRST,
    take: TRENDING_CANDIDATE_LIMIT,
    select: STORY_SUMMARY_SELECT,
  })) as StoryRow[];

  if (candidates.length === 0) {
    return { ...emptyPage<StorySummary>(), scope: 'trending', fallback: false };
  }

  const ids = candidates.map((row) => row.id);

  // Two grouped aggregates for the whole candidate set — not one per story.
  const [clapRows, commentRows] = await Promise.all([
    db.clap.groupBy({
      by: ['storyId'],
      where: { storyId: { in: ids }, createdAt: { gte: windowStart } },
      _sum: { count: true },
    }),
    db.comment.groupBy({
      by: ['storyId'],
      where: { storyId: { in: ids }, deletedAt: null, createdAt: { gte: windowStart } },
      _count: { _all: true },
    }),
  ]);

  const clapsInWindow = new Map(clapRows.map((row) => [row.storyId, row._sum.count ?? 0]));
  const commentsInWindow = new Map(commentRows.map((row) => [row.storyId, row._count._all]));

  const ranked = candidates
    .map((row) => ({
      row,
      id: row.id,
      publishedAt: row.publishedAt,
      score: trendingScore({
        claps: clapsInWindow.get(row.id) ?? 0,
        comments: commentsInWindow.get(row.id) ?? 0,
        publishedAt: row.publishedAt,
        now,
      }),
    }))
    // A story nobody engaged with this week is not trending — it is just new,
    // and the Latest tab already covers that.
    .filter((entry) => entry.score > 0)
    .sort(compareTrending);

  // Pagination walks the ranked list; the lookahead lives there, so only the
  // visible rows are ever hydrated.
  const slice = sliceByCursor(ranked, params);
  const items = await loadStorySummaries(
    slice.entries.map((entry) => entry.row),
    db,
  );

  return { items, nextCursor: slice.nextCursor, scope: 'trending', fallback: false };
}

/** Published stories carrying a tag, newest first. */
export async function tagFeed(
  tagId: string,
  params: PageParams,
  db: FeedDb = prisma,
): Promise<Page<StorySummary>> {
  const rows = (await db.story.findMany({
    where: { ...PUBLISHED_WHERE, tags: { some: { tagId } } },
    orderBy: RECENT_FIRST,
    select: STORY_SUMMARY_SELECT,
    ...prismaPageArgs(params),
  })) as StoryRow[];

  return materialize(rows, params.limit, db);
}

/* ------------------------------------------------------------------ *
 * Tag archives
 * ------------------------------------------------------------------ */

export type TagArchive = {
  tag: { id: string; name: string; slug: string; viewerIsFollowing: boolean };
  /** Total PUBLISHED stories carrying the tag — the whole archive, not the page. */
  storyCount: number;
  page: Page<StorySummary>;
};

/**
 * Everything the tag page renders, in a fixed number of queries (4, or 3 when
 * signed out) regardless of how many stories come back.
 *
 * Returns null for an unknown slug so the route can call `notFound()` — a 404
 * belongs to the route layer, not to a data function.
 */
export async function tagArchive(
  slug: string,
  params: PageParams,
  options: { viewerId?: string | null; db?: FeedDb } = {},
): Promise<TagArchive | null> {
  const db = options.db ?? prisma;
  const viewerId = options.viewerId ?? null;

  const tag = await db.tag.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!tag) return null;

  const publishedWithTag = { ...PUBLISHED_WHERE, tags: { some: { tagId: tag.id } } };

  const [storyCount, page, follow] = await Promise.all([
    db.story.count({ where: publishedWithTag }),
    tagFeed(tag.id, params, db),
    viewerId
      ? db.tagFollow.findUnique({
          where: { userId_tagId: { userId: viewerId, tagId: tag.id } },
          select: { tagId: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    tag: { ...tag, viewerIsFollowing: follow !== null },
    storyCount,
    page,
  };
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/**
 * Drop the lookahead row BEFORE hydrating, so the extra row never costs an
 * aggregate, then re-derive nextCursor from whether it existed.
 */
async function materialize(rows: StoryRow[], limit: number, db: FeedDb): Promise<Page<StorySummary>> {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const items = await loadStorySummaries(visible, db);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? last.id : null };
}

/** Cursor walk over an in-memory ranked list (trending, search). */
export function sliceByCursor<T extends { id: string }>(
  entries: T[],
  params: PageParams,
): { entries: T[]; nextCursor: string | null } {
  let start = 0;
  if (params.cursor) {
    const index = entries.findIndex((entry) => entry.id === params.cursor);
    // A cursor we cannot place is stale (the row fell out of the ranked set).
    // Returning nothing is honest; guessing an offset would duplicate rows.
    if (index < 0) return { entries: [], nextCursor: null };
    start = index + 1;
  }
  const window = entries.slice(start, start + params.limit + 1);
  const hasMore = window.length > params.limit;
  const visible = hasMore ? window.slice(0, params.limit) : window;
  const last = visible[visible.length - 1];
  return { entries: visible, nextCursor: hasMore && last ? last.id : null };
}
