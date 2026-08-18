import type { Prisma, StoryStatus } from '@prisma/client';
import { excerptFromHtml } from '@/lib/sanitize';
import type { TagSummary } from '@/lib/types';

/**
 * Wire shapes for the authoring API.
 *
 * `StoryDto` is deliberately NOT `StoryDetail` from `@/lib/types`: that shape is
 * the READING contract (clap counts, bookmark state, follow state, a resolved
 * author) and carrying it here would mean four extra joins on every autosave.
 * The editor needs the author's own draft and nothing about other people.
 */

/** Prisma include that satisfies `toStoryDto`. */
export const STORY_INCLUDE = {
  tags: { include: { tag: true } },
} satisfies Prisma.StoryInclude;

export type StoryWithTags = Prisma.StoryGetPayload<{ include: typeof STORY_INCLUDE }>;

export type StoryDto = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  bodyHtml: string;
  excerpt: string;
  coverImageUrl: string | null;
  status: StoryStatus;
  readingTimeMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagSummary[];
};

/**
 * Serialize a story row for the wire.
 *
 * Dates become ISO strings because a Date does not survive JSON and a client
 * component cannot receive one from a server component either.
 */
export function toStoryDto(story: StoryWithTags): StoryDto {
  return {
    id: story.id,
    title: story.title,
    subtitle: story.subtitle,
    slug: story.slug,
    bodyHtml: story.bodyHtml,
    excerpt: excerptFromHtml(story.bodyHtml),
    coverImageUrl: story.coverImageUrl,
    status: story.status,
    readingTimeMinutes: story.readingTimeMinutes,
    publishedAt: story.publishedAt ? story.publishedAt.toISOString() : null,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
    tags: story.tags.map(
      ({ tag }): TagSummary => ({ id: tag.id, name: tag.name, slug: tag.slug }),
    ),
  };
}
