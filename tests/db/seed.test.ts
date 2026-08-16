import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, tableCounts, testPrisma } from '@tests/helpers/db';

/**
 * Seed idempotency and determinism.
 *
 * Acceptance criterion: `npm run db:seed && npm run db:seed` must leave exactly
 * the same rows. A non-idempotent seed silently doubles fixtures every time a
 * developer re-runs it, and downstream tests start failing on counts.
 *
 * TWO THINGS THIS FILE IS CAREFUL ABOUT — both were real bugs:
 *
 * 1. The child process is told EXACTLY which database to write, via
 *    SEED_DATABASE_URL (absolute). Relying on ambient env or .env made the seed
 *    write dev.db while these tests read test.db, so every count came back 0.
 *
 * 2. Every comparison is guarded by a NON-ZERO PRECONDITION. Idempotency,
 *    determinism and "all rows sanitized" all pass VACUOUSLY on an empty
 *    database (0 == 0, [] == [], "for every row" over no rows). Without the
 *    preconditions this suite reports green when the seed did nothing at all —
 *    a worse defect than a failing test, because it hides.
 */

function runSeed() {
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Both, so it works whether or not .env clobbers DATABASE_URL on import.
      DATABASE_URL: TEST_DATABASE_URL,
      SEED_DATABASE_URL: TEST_DATABASE_URL,
    },
  });
}

/** Fixture sizes the seed is contracted to produce. */
const EXPECTED = {
  users: 3,
  tags: 6,
  publishedStories: 8,
  draftStories: 1,
} as const;

describe('prisma/seed.ts', () => {
  it('writes to the database the tests actually read', async () => {
    // The canary for the class of bug above: if the seed lands in another file,
    // this fails immediately and unambiguously instead of as a puzzling 0-count.
    runSeed();
    const counts = await tableCounts();
    expect(counts.users).toBeGreaterThan(0);
    expect(counts.stories).toBeGreaterThan(0);
  }, 120_000);

  it('is idempotent: seeding twice creates no duplicate rows', async () => {
    runSeed();
    const first = await tableCounts();

    // PRECONDITION: without this, 0 === 0 would make this test pass on an
    // empty database and hide a completely broken seed.
    expect(first.users).toBeGreaterThan(0);
    expect(first.stories).toBeGreaterThan(0);
    expect(first.comments).toBeGreaterThan(0);

    runSeed();
    const second = await tableCounts();

    expect(second).toEqual(first);
  }, 120_000);

  it('produces the documented fixture set', async () => {
    runSeed();
    const counts = await tableCounts();

    expect(counts.users).toBe(EXPECTED.users);
    expect(counts.tags).toBe(EXPECTED.tags);
    expect(counts.stories).toBe(EXPECTED.publishedStories + EXPECTED.draftStories);
    expect(await testPrisma.story.count({ where: { status: 'PUBLISHED' } })).toBe(
      EXPECTED.publishedStories,
    );
    expect(await testPrisma.story.count({ where: { status: 'DRAFT' } })).toBe(
      EXPECTED.draftStories,
    );
    expect(counts.follows).toBeGreaterThan(0);
    expect(counts.claps).toBeGreaterThan(0);
    expect(counts.bookmarks).toBeGreaterThan(0);
    expect(counts.comments).toBeGreaterThan(0);
    expect(counts.storyTags).toBeGreaterThan(0);
  }, 120_000);

  it('is deterministic: ids, slugs and publish dates are stable across runs', async () => {
    runSeed();
    const before = await testPrisma.story.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, slug: true, publishedAt: true, readingTimeMinutes: true },
    });

    // PRECONDITION: [] equals [] — an empty result would pass vacuously.
    expect(before.length).toBe(EXPECTED.publishedStories + EXPECTED.draftStories);

    runSeed();
    const after = await testPrisma.story.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, slug: true, publishedAt: true, readingTimeMinutes: true },
    });

    expect(after).toEqual(before);
  }, 120_000);

  it('stores only sanitized HTML', async () => {
    runSeed();
    const stories = await testPrisma.story.findMany({ select: { bodyHtml: true } });

    // PRECONDITION: "every row is clean" is trivially true over zero rows.
    expect(stories.length).toBeGreaterThan(0);

    for (const story of stories) {
      expect(story.bodyHtml).not.toContain('<script');
      expect(story.bodyHtml).not.toContain('onerror=');
      expect(story.bodyHtml.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('threads at least one comment reply', async () => {
    runSeed();
    const all = await testPrisma.comment.count();
    expect(all).toBeGreaterThan(0);

    const replies = await testPrisma.comment.findMany({ where: { NOT: { parentId: null } } });
    expect(replies.length).toBeGreaterThan(0);
  }, 120_000);

  it('seeds users whose passwords verify', async () => {
    runSeed();
    const users = await testPrisma.user.findMany({ select: { email: true, passwordHash: true } });
    expect(users.length).toBe(EXPECTED.users);
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user.passwordHash).not.toContain('password123');
    }
  }, 120_000);
});
