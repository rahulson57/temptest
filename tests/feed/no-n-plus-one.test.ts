import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { makeStory, makeTag, makeUser, resetFactoryCounter } from '../helpers/factories';
import { globalFeed, personalFeed, tagArchive, tagFeed, trendingFeed } from '@/server/feed/queries';
import { searchStories } from '@/server/search/query';
import type { FeedDb } from '@/server/feed/db';
import { pageParams } from '@/lib/pagination';

/**
 * NO N+1 — the query count must be CONSTANT in the number of rows returned.
 *
 * This is the test that stops the classic regression: someone adds a
 * `Promise.all(rows.map(row => prisma.clap.aggregate(...)))` to fix a display
 * bug, every feed silently becomes O(page size) queries, and nothing fails
 * until production. Asserting "fewer than N" would not catch it — the count is
 * asserted to be IDENTICAL at 1 story and at 20.
 *
 * Every query function takes `db` as its last argument precisely so this test
 * can hand in an instrumented client (see src/server/feed/db.ts).
 */

const NOW = new Date('2025-03-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

/** Prisma delegates used by the discovery layer. */
const DELEGATES = ['story', 'clap', 'comment', 'follow', 'tagFollow', 'tag'] as const;

type Counter = { db: FeedDb; count: () => number; reset: () => void; log: () => string[] };

/**
 * Wrap the real client so every delegate call is counted.
 *
 * A Proxy over the delegate rather than Prisma's `$on('query')` hook: the hook
 * needs `log: ['query']` on a dedicated client and reports at the SQL level,
 * where Prisma's own relation loading would inflate the number in ways that are
 * not the caller's fault. Counting delegate calls measures exactly what this
 * code controls — how many times WE ask the database for something.
 */
function countingDb(): Counter {
  let count = 0;
  const log: string[] = [];

  const wrap = <T extends object>(delegate: T, name: string): T =>
    new Proxy(delegate, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== 'function' || typeof prop !== 'string') return value;
        return (...args: unknown[]) => {
          count += 1;
          log.push(`${name}.${prop}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });

  const db = Object.fromEntries(
    DELEGATES.map((name) => [name, wrap(testPrisma[name] as object, name)]),
  ) as unknown as FeedDb;

  return {
    db,
    count: () => count,
    reset: () => {
      count = 0;
      log.length = 0;
    },
    log: () => [...log],
  };
}

/** Publish `n` stories by one author, newest first, optionally tagged. */
async function seedStories(n: number, options: { authorId: string; tagId?: string }) {
  for (let i = 0; i < n; i += 1) {
    await makeStory({
      authorId: options.authorId,
      title: `Story ${i}`,
      publishedAt: hoursAgo(i + 1),
      tagIds: options.tagId ? [options.tagId] : [],
    });
  }
}

/** Give every published story a clap and a comment, so aggregates have work. */
async function seedEngagement(readerId: string) {
  const stories = await testPrisma.story.findMany({ select: { id: true } });
  let n = 0;
  for (const story of stories) {
    n += 1;
    await testPrisma.clap.create({
      data: { userId: readerId, storyId: story.id, count: 3, createdAt: hoursAgo(1) },
    });
    await testPrisma.comment.create({
      data: {
        id: `nplus1-comment-${n}`,
        storyId: story.id,
        authorId: readerId,
        bodyText: 'A response',
        createdAt: hoursAgo(1),
      },
    });
  }
}

beforeEach(() => {
  resetFactoryCounter();
});

describe('globalFeed — constant query count', () => {
  it('costs the same number of queries for 20 stories as for 1', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    await seedStories(1, { authorId: author.id });
    await seedEngagement(reader.id);

    const counter = countingDb();
    const one = await globalFeed(pageParams({ limit: 50 }), counter.db);
    const oneQueries = counter.count();

    // Sanity: the measurement is measuring something.
    expect(one.items).toHaveLength(1);
    expect(oneQueries).toBeGreaterThan(0);

    // Now 20 stories, all on one page.
    await testPrisma.comment.deleteMany({});
    await testPrisma.clap.deleteMany({});
    await testPrisma.storyTag.deleteMany({});
    await testPrisma.story.deleteMany({});
    await seedStories(20, { authorId: author.id });
    await seedEngagement(reader.id);

    counter.reset();
    const twenty = await globalFeed(pageParams({ limit: 50 }), counter.db);
    const twentyQueries = counter.count();

    expect(twenty.items).toHaveLength(20);
    expect(twenty.items[0]?.clapCount).toBe(3);
    expect(twenty.items[0]?.commentCount).toBe(1);
    expect(twentyQueries).toBe(oneQueries);
    // Two: the page of rows, and one grouped clap aggregate for all of them.
    expect(twentyQueries).toBe(2);
    expect(counter.log()).toEqual(['story.findMany', 'clap.groupBy']);
  });
});

describe('the other discovery surfaces are constant too', () => {
  it('personalFeed does not scale with the number of stories', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    await testPrisma.follow.create({ data: { followerId: reader.id, followingId: author.id } });

    await seedStories(1, { authorId: author.id });
    const counter = countingDb();
    const one = await personalFeed(reader.id, pageParams({ limit: 50 }), counter.db);
    const oneQueries = counter.count();
    expect(one.items).toHaveLength(1);

    await seedStories(19, { authorId: author.id });
    counter.reset();
    const twenty = await personalFeed(reader.id, pageParams({ limit: 50 }), counter.db);

    expect(twenty.items).toHaveLength(20);
    expect(counter.count()).toBe(oneQueries);
  });

  it('trendingFeed does not scale with the number of stories', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    await seedStories(1, { authorId: author.id });
    await seedEngagement(reader.id);
    const counter = countingDb();
    const one = await trendingFeed(pageParams({ limit: 50 }), { now: NOW, db: counter.db });
    const oneQueries = counter.count();
    expect(one.items).toHaveLength(1);

    await seedStories(19, { authorId: author.id });
    await testPrisma.clap.deleteMany({});
    await testPrisma.comment.deleteMany({});
    await seedEngagement(reader.id);

    counter.reset();
    const twenty = await trendingFeed(pageParams({ limit: 50 }), { now: NOW, db: counter.db });

    expect(twenty.items).toHaveLength(20);
    expect(counter.count()).toBe(oneQueries);
  });

  it('tagFeed does not scale with the number of stories', async () => {
    const author = await makeUser();
    const tag = await makeTag({ name: 'Scaling', slug: 'scaling' });

    await seedStories(1, { authorId: author.id, tagId: tag.id });
    const counter = countingDb();
    const one = await tagFeed(tag.id, pageParams({ limit: 50 }), counter.db);
    const oneQueries = counter.count();
    expect(one.items).toHaveLength(1);

    await seedStories(19, { authorId: author.id, tagId: tag.id });
    counter.reset();
    const twenty = await tagFeed(tag.id, pageParams({ limit: 50 }), counter.db);

    expect(twenty.items).toHaveLength(20);
    expect(counter.count()).toBe(oneQueries);
  });

  it('the whole tag archive page is a fixed number of queries', async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const tag = await makeTag({ name: 'Archive', slug: 'archive' });
    await testPrisma.tagFollow.create({ data: { userId: reader.id, tagId: tag.id } });

    await seedStories(1, { authorId: author.id, tagId: tag.id });
    const counter = countingDb();
    const one = await tagArchive(tag.slug, pageParams({ limit: 50 }), {
      viewerId: reader.id,
      db: counter.db,
    });
    const oneQueries = counter.count();
    expect(one?.page.items).toHaveLength(1);
    expect(one?.storyCount).toBe(1);
    expect(one?.tag.viewerIsFollowing).toBe(true);

    await seedStories(19, { authorId: author.id, tagId: tag.id });
    counter.reset();
    const twenty = await tagArchive(tag.slug, pageParams({ limit: 50 }), {
      viewerId: reader.id,
      db: counter.db,
    });

    expect(twenty?.page.items).toHaveLength(20);
    expect(twenty?.storyCount).toBe(20);
    expect(counter.count()).toBe(oneQueries);
  });

  it('searchStories does not scale with the number of results', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    await makeStory({
      authorId: author.id,
      title: 'Kittens 0',
      publishedAt: hoursAgo(1),
    });
    await seedEngagement(reader.id);

    const counter = countingDb();
    const one = await searchStories('kittens', pageParams({ limit: 50 }), counter.db);
    const oneQueries = counter.count();
    expect(one.items).toHaveLength(1);

    for (let i = 1; i < 20; i += 1) {
      await makeStory({ authorId: author.id, title: `Kittens ${i}`, publishedAt: hoursAgo(i + 1) });
    }

    counter.reset();
    const twenty = await searchStories('kittens', pageParams({ limit: 50 }), counter.db);

    expect(twenty.items).toHaveLength(20);
    expect(counter.count()).toBe(oneQueries);
    expect(counter.count()).toBe(2);
  });
});
