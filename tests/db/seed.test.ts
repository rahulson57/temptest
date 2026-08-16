import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { tableCounts, testPrisma } from '@tests/helpers/db';

/**
 * Seed idempotency.
 *
 * Acceptance criterion: `npm run db:seed && npm run db:seed` must leave exactly
 * the same rows. A non-idempotent seed silently doubles fixtures every time a
 * developer re-runs it, and downstream tests start failing on counts.
 */

function runSeed() {
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'pipe',
    // Inherit this run's DATABASE_URL — never hardcode a shared file, or a
    // concurrent test run would seed into the wrong database.
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

describe('prisma/seed.ts', () => {
  it('is idempotent: seeding twice creates no duplicate rows', async () => {
    runSeed();
    const first = await tableCounts();

    runSeed();
    const second = await tableCounts();

    expect(second).toEqual(first);
  }, 120_000);

  it('produces the documented fixture set', async () => {
    runSeed();
    const counts = await tableCounts();

    expect(counts.users).toBe(3);
    expect(counts.tags).toBe(6);
    // 8 published + 1 draft.
    expect(counts.stories).toBe(9);
    expect(await testPrisma.story.count({ where: { status: 'PUBLISHED' } })).toBe(8);
    expect(await testPrisma.story.count({ where: { status: 'DRAFT' } })).toBe(1);
    expect(counts.follows).toBeGreaterThan(0);
    expect(counts.claps).toBeGreaterThan(0);
    expect(counts.bookmarks).toBeGreaterThan(0);
    expect(counts.comments).toBeGreaterThan(0);
  }, 120_000);

  it('is deterministic: ids, slugs and publish dates are stable across runs', async () => {
    runSeed();
    const before = await testPrisma.story.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, slug: true, publishedAt: true, readingTimeMinutes: true },
    });

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
    for (const story of stories) {
      expect(story.bodyHtml).not.toContain('<script');
      expect(story.bodyHtml).not.toContain('onerror=');
    }
  }, 120_000);

  it('threads at least one comment reply', async () => {
    runSeed();
    const replies = await testPrisma.comment.findMany({ where: { NOT: { parentId: null } } });
    expect(replies.length).toBeGreaterThan(0);
  }, 120_000);
});
