import { PUBLIC_USER_SELECT } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { excerptFromHtml } from '@/lib/sanitize';
import type { StorySummary } from '@/lib/types';

/**
 * Story → StorySummary mapping for this vertical's two list surfaces: the
 * reading list (bookmarks) and the profile's published stories.
 *
 * NO N+1. Clap totals and comment counts are resolved for the WHOLE page in one
 * groupBy each, so a page of 50 stories costs 3 queries, not 101. Never move
 * these into a per-row `await` inside a map.
 *
 * `bodyHtml` is selected only to derive the excerpt; it is dropped before the
 * summary leaves this module, so no list surface ships a full story body to the
 * client.
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
} as const;

export type StoryRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  bodyHtml: string;
  coverImageUrl: string | null;
  status: StorySummary['status'];
  readingTimeMinutes: number;
  publishedAt: Date | null;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; bio: string | null };
  tags: { tag: { id: string; name: string; slug: string } }[];
};

/** Map a page of story rows to view models, resolving counts in bulk. */
export async function toStorySummaries(rows: StoryRow[]): Promise<StorySummary[]> {
  if (rows.length === 0) return [];

  const storyIds = rows.map((row) => row.id);

  const [clapGroups, commentGroups] = await Promise.all([
    prisma.clap.groupBy({
      by: ['storyId'],
      where: { storyId: { in: storyIds } },
      _sum: { count: true },
    }),
    prisma.comment.groupBy({
      by: ['storyId'],
      // Soft-deleted comments are tombstones, not responses — don't count them.
      where: { storyId: { in: storyIds }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const clapsByStory = new Map(clapGroups.map((row) => [row.storyId, row._sum.count ?? 0]));
  const commentsByStory = new Map(commentGroups.map((row) => [row.storyId, row._count._all]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: excerptFromHtml(row.bodyHtml),
    coverImageUrl: row.coverImageUrl,
    status: row.status,
    readingTimeMinutes: row.readingTimeMinutes,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    author: {
      id: row.author.id,
      handle: row.author.handle,
      displayName: row.author.displayName,
      avatarUrl: row.author.avatarUrl,
      bio: row.author.bio,
    },
    tags: row.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
    clapCount: clapsByStory.get(row.id) ?? 0,
    commentCount: commentsByStory.get(row.id) ?? 0,
  }));
}
