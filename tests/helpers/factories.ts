import type { Comment, Story, Tag, User } from '@prisma/client';
import { readingTimeMinutes } from '@/lib/readingTime';
import { sanitizeStoryHtml } from '@/lib/sanitize';
import { slugify } from '@/lib/slug';
import { testPrisma } from './db';

/**
 * Deterministic test factories.
 *
 * No randomness: ids and emails come from a monotonic counter that resets with
 * each truncated database, so a failing assertion always reports the same
 * values and tests never flake on a colliding random string.
 *
 * Every factory takes overrides so a test can state ONLY what it cares about.
 */

let counter = 0;
const next = () => ++counter;

/** Fixed clock — nothing in a fixture should depend on the wall clock. */
export const FIXTURE_NOW = new Date('2025-03-01T12:00:00.000Z');

/**
 * A real, pre-computed bcrypt hash of KNOWN_PASSWORD at cost 12.
 * tests/lib/factories.test.ts asserts these two stay in sync, so this can never
 * silently rot into a value that no password verifies against.
 */
export const KNOWN_PASSWORD = 'password123';
export const KNOWN_PASSWORD_HASH =
  '$2a$12$.YiRXh0AJLy6zccjI7tcIeBhfk7aWw.11PTJ4f16gvK5ZKKN6xl9a';

export type MakeUserOptions = Partial<
  Pick<User, 'id' | 'email' | 'handle' | 'displayName' | 'bio' | 'avatarUrl' | 'passwordHash'>
>;

export async function makeUser(overrides: MakeUserOptions = {}): Promise<User> {
  const n = next();
  return testPrisma.user.create({
    data: {
      id: overrides.id ?? `user-${n}`,
      email: overrides.email ?? `user-${n}@example.com`,
      handle: overrides.handle ?? `user${n}`,
      displayName: overrides.displayName ?? `User ${n}`,
      bio: overrides.bio ?? null,
      avatarUrl: overrides.avatarUrl ?? null,
      // Hashing is ~250ms by design; fixtures reuse a known hash so a suite
      // that creates 20 users does not spend 5 seconds in bcrypt.
      passwordHash: overrides.passwordHash ?? KNOWN_PASSWORD_HASH,
      createdAt: FIXTURE_NOW,
    },
  });
}

export type MakeTagOptions = Partial<Pick<Tag, 'id' | 'name' | 'slug'>>;

export async function makeTag(overrides: MakeTagOptions = {}): Promise<Tag> {
  const n = next();
  const name = overrides.name ?? `Tag ${n}`;
  return testPrisma.tag.create({
    data: {
      id: overrides.id ?? `tag-${n}`,
      name,
      slug: overrides.slug ?? (slugify(name) || `tag-${n}`),
    },
  });
}

export type MakeStoryOptions = Partial<
  Pick<
    Story,
    | 'id'
    | 'title'
    | 'subtitle'
    | 'slug'
    | 'bodyHtml'
    | 'coverImageUrl'
    | 'status'
    | 'publishedAt'
    | 'createdAt'
  >
> & {
  authorId?: string;
  /** Tag ids to attach via StoryTag. */
  tagIds?: string[];
};

/**
 * Creates a PUBLISHED story by default (the common case in feed/reading tests).
 * Pass `status: 'DRAFT'` for authoring tests; publishedAt is then forced null.
 */
export async function makeStory(overrides: MakeStoryOptions = {}): Promise<Story> {
  const n = next();
  const authorId = overrides.authorId ?? (await makeUser()).id;
  const title = overrides.title ?? `Story ${n}`;
  const bodyHtml = sanitizeStoryHtml(overrides.bodyHtml ?? `<p>Body of story ${n}.</p>`);
  const status = overrides.status ?? 'PUBLISHED';
  const publishedAt =
    status === 'PUBLISHED' ? (overrides.publishedAt ?? FIXTURE_NOW) : null;

  const story = await testPrisma.story.create({
    data: {
      id: overrides.id ?? `story-${n}`,
      authorId,
      title,
      subtitle: overrides.subtitle ?? null,
      slug: overrides.slug ?? `${slugify(title) || 'story'}-${n}`,
      bodyHtml,
      coverImageUrl: overrides.coverImageUrl ?? null,
      status,
      readingTimeMinutes: readingTimeMinutes(bodyHtml),
      publishedAt,
      createdAt: overrides.createdAt ?? FIXTURE_NOW,
    },
  });

  for (const tagId of overrides.tagIds ?? []) {
    await testPrisma.storyTag.create({ data: { storyId: story.id, tagId } });
  }

  return story;
}

export type MakeCommentOptions = Partial<Pick<Comment, 'id' | 'bodyText' | 'parentId'>> & {
  storyId?: string;
  authorId?: string;
};

export async function makeComment(overrides: MakeCommentOptions = {}): Promise<Comment> {
  const n = next();
  const storyId = overrides.storyId ?? (await makeStory()).id;
  const authorId = overrides.authorId ?? (await makeUser()).id;
  return testPrisma.comment.create({
    data: {
      id: overrides.id ?? `comment-${n}`,
      storyId,
      authorId,
      parentId: overrides.parentId ?? null,
      bodyText: overrides.bodyText ?? `Comment ${n}`,
      createdAt: FIXTURE_NOW,
    },
  });
}

/** Reset the id counter. vitest.setup.ts truncates; call this for readable ids. */
export function resetFactoryCounter(): void {
  counter = 0;
}
