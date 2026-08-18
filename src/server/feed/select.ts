import { prisma } from '@/lib/db';
import { PUBLIC_USER_SELECT } from '@/lib/auth';
import { excerptFromHtml } from '@/lib/sanitize';
import type { StorySummary, StoryStatus } from '@/lib/types';
import type { FeedDb } from './db';

/**
 * The ONE story projection every discovery surface reads (feed, trending, tag
 * archive, search).
 *
 * Everything a <StoryCard> needs is loaded in a single `findMany` — author,
 * tags and the comment count all come back as part of that query, so a page of
 * 50 stories costs the same number of round trips as a page of 1. See
 * `loadStorySummaries` for the one deliberate exception (clap totals), which is
 * a single grouped aggregate rather than a per-row lookup.
 *
 * Do NOT add a `Promise.all(rows.map(...))` over this — that is the N+1 this
 * module exists to prevent, and tests/feed/no-n-plus-one.test.ts will fail.
 */
export const STORY_SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  bodyHtml: true,
  coverImageUrl: true,
  status: true,
  readingTimeMinutes: true,
  publishedAt: true,
  author: { select: PUBLIC_USER_SELECT },
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
  // Soft-deleted comments are tombstones, not responses — don't count them.
  _count: { select: { comments: { where: { deletedAt: null } } } },
};

/** The row shape produced by STORY_SUMMARY_SELECT. */
export type StoryRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  bodyHtml: string;
  coverImageUrl: string | null;
  status: StoryStatus;
  readingTimeMinutes: number;
  publishedAt: Date | null;
  author: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count: { comments: number };
};

/** Only PUBLISHED stories are discoverable. Drafts never leave their author. */
export const PUBLISHED_WHERE = { status: 'PUBLISHED' as const, publishedAt: { not: null } };

/** Newest first, with `id` as a stable tie-break so cursors never repeat a row. */
export const RECENT_FIRST = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Total claps per story, as ONE grouped aggregate.
 *
 * `Clap.count` is claps-per-user, so the visible total is a SUM over rows, not
 * a row count — `_count` would under-report every multi-clap story.
 */
export async function clapTotals(
  storyIds: string[],
  db: FeedDb = prisma,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (storyIds.length === 0) return totals;

  const rows = await db.clap.groupBy({
    by: ['storyId'],
    where: { storyId: { in: storyIds } },
    _sum: { count: true },
  });

  for (const row of rows) {
    totals.set(row.storyId, row._sum.count ?? 0);
  }
  return totals;
}

/** Map one row plus its resolved clap total into the shared view model. */
export function toStorySummary(row: StoryRow, clapCount: number): StorySummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: excerptFromHtml(row.bodyHtml),
    coverImageUrl: row.coverImageUrl,
    status: row.status,
    readingTimeMinutes: row.readingTimeMinutes,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    author: row.author,
    tags: row.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
    clapCount,
    commentCount: row._count.comments,
  };
}

/**
 * Turn a page of rows into view models. Costs exactly ONE extra query (the clap
 * aggregate) no matter how many rows there are, and zero when there are none.
 */
export async function loadStorySummaries(
  rows: StoryRow[],
  db: FeedDb = prisma,
): Promise<StorySummary[]> {
  const totals = await clapTotals(
    rows.map((row) => row.id),
    db,
  );
  return rows.map((row) => toStorySummary(row, totals.get(row.id) ?? 0));
}
