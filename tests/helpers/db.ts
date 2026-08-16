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

/**
 * Resolve the test database URL.
 *
 * TEST_DATABASE_URL is set by tests/helpers/global-setup.ts (absolute path) and
 * inherited by every forked worker. Prefer it over DATABASE_URL: importing
 * @prisma/client loads .env, which can overwrite process.env.DATABASE_URL with
 * the DEV database — that is precisely how a test suite ends up asserting
 * against one file while the seed writes another.
 *
 * Fail loudly rather than silently defaulting: a suite pointed at the wrong
 * database produces confusing "0 rows" failures instead of an obvious error.
 */
function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'No TEST_DATABASE_URL/DATABASE_URL set. tests/helpers/global-setup.ts must run first ' +
        '(it is wired as globalSetup in vitest.config.ts).',
    );
  }
  return url;
}

export const TEST_DATABASE_URL = testDatabaseUrl();

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
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
