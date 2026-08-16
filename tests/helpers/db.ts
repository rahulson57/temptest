import { PrismaClient } from '@prisma/client';

/**
 * Test database lifecycle.
 *
 * The schema is created once by tests/helpers/global-setup.ts. This module owns
 * the per-test contract: a truncated database before every test, and a clean
 * disconnect at the end of the file.
 *
 * Truncating (rather than re-migrating) between tests keeps a full suite in the
 * low seconds while still guaranteeing isolation.
 */

process.env.DATABASE_URL ??= 'file:./test.db';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['error'],
});

/**
 * Child-before-parent order. SQLite enforces foreign keys, so deleting User
 * first would fail on Story.authorId.
 */
const DELETION_ORDER = [
  'StoryTag',
  'Clap',
  'Bookmark',
  'Comment',
  'Follow',
  'TagFollow',
  'Upload',
  'Story',
  'Tag',
  'User',
] as const;

/** Delete every row in every table. Called before each test by vitest.setup.ts. */
export async function truncateDatabase(): Promise<void> {
  for (const table of DELETION_ORDER) {
    await testPrisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

/** Close the pool. Called in afterAll by vitest.setup.ts. */
export async function disconnectDatabase(): Promise<void> {
  await testPrisma.$disconnect();
}

/** Row counts for every table — handy for idempotency assertions. */
export async function tableCounts(): Promise<Record<string, number>> {
  const [users, stories, tags, storyTags, comments, claps, bookmarks, follows, tagFollows] =
    await Promise.all([
      testPrisma.user.count(),
      testPrisma.story.count(),
      testPrisma.tag.count(),
      testPrisma.storyTag.count(),
      testPrisma.comment.count(),
      testPrisma.clap.count(),
      testPrisma.bookmark.count(),
      testPrisma.follow.count(),
      testPrisma.tagFollow.count(),
    ]);
  return { users, stories, tags, storyTags, comments, claps, bookmarks, follows, tagFollows };
}

export default testPrisma;
