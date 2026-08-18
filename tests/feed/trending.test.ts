import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { trendingFeed } from '@/server/feed/queries';
import {
  TRENDING_CLAP_WEIGHT,
  TRENDING_COMMENT_WEIGHT,
  TRENDING_HALF_LIFE_HOURS,
  TRENDING_WINDOW_DAYS,
  compareTrending,
  trendingScore,
  trendingWindowStart,
} from '@/server/feed/score';
import { pageParams } from '@/lib/pagination';

/**
 * TRENDING — the ranking is documented in src/server/feed/score.ts:
 *
 *   engagement = 1·clapsInWindow + 3·commentsInWindow
 *   decay      = 0.5 ** (ageHours / 72)
 *   score      = round(engagement · decay, 6)
 *
 * These tests pin the FORMULA (pure, injected clock) and then the QUERY that
 * applies it to fixed fixture data. `now` is injected everywhere — a trending
 * test that reads the wall clock is a trending test that fails at midnight.
 */

const NOW = new Date('2025-03-01T12:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * MS_PER_HOUR);
const daysAgo = (d: number) => hoursAgo(d * 24);

beforeEach(() => {
  resetFactoryCounter();
});

describe('trendingScore — the documented formula', () => {
  it('is exactly engagement × decay at the half-life', async () => {
    // 10 claps, no comments, published exactly one half-life ago.
    const score = trendingScore({ claps: 10, comments: 0, publishedAt: hoursAgo(72), now: NOW });
    expect(score).toBeCloseTo(5, 6);
  });

  it('applies no decay to a story published this instant', () => {
    const score = trendingScore({ claps: 10, comments: 0, publishedAt: NOW, now: NOW });
    expect(score).toBe(10);
  });

  it('weights a comment 3× a clap', () => {
    const claps = trendingScore({ claps: 3, comments: 0, publishedAt: NOW, now: NOW });
    const comments = trendingScore({ claps: 0, comments: 1, publishedAt: NOW, now: NOW });
    expect(comments).toBe(claps);
    expect(TRENDING_COMMENT_WEIGHT / TRENDING_CLAP_WEIGHT).toBe(3);
  });

  it('lets recent engagement beat older, larger engagement', () => {
    // Yesterday's 10 claps vs last week's 20 — the stated design goal.
    const yesterday = trendingScore({
      claps: 10,
      comments: 0,
      publishedAt: hoursAgo(24),
      now: NOW,
    });
    const lastWeek = trendingScore({ claps: 20, comments: 0, publishedAt: daysAgo(7), now: NOW });
    expect(yesterday).toBeGreaterThan(lastWeek);
  });

  it('scores zero with no engagement, and zero for an unpublished story', () => {
    expect(trendingScore({ claps: 0, comments: 0, publishedAt: NOW, now: NOW })).toBe(0);
    expect(trendingScore({ claps: 99, comments: 99, publishedAt: null, now: NOW })).toBe(0);
  });

  it('is deterministic: same inputs, same output, every time', () => {
    const input = { claps: 7, comments: 2, publishedAt: hoursAgo(37), now: NOW };
    const runs = Array.from({ length: 5 }, () => trendingScore({ ...input }));
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBeGreaterThan(0);
  });

  it('rounds to 6 decimals so equal scores compare equal', () => {
    const a = trendingScore({ claps: 1, comments: 1, publishedAt: hoursAgo(5), now: NOW });
    const b = trendingScore({ claps: 4, comments: 0, publishedAt: hoursAgo(5), now: NOW });
    // 1·1 + 3·1 = 4 = 1·4 + 3·0 — identical engagement, identical age.
    expect(a).toBe(b);
  });

  it('opens the engagement window exactly TRENDING_WINDOW_DAYS back', () => {
    const start = trendingWindowStart(NOW);
    expect(NOW.getTime() - start.getTime()).toBe(TRENDING_WINDOW_DAYS * 24 * MS_PER_HOUR);
    expect(TRENDING_HALF_LIFE_HOURS).toBe(72);
  });
});

describe('compareTrending — the total order', () => {
  it('sorts by score desc, then newest, then id asc', () => {
    const rows = [
      { id: 'c', score: 5, publishedAt: hoursAgo(1) },
      { id: 'a', score: 9, publishedAt: hoursAgo(50) },
      { id: 'b', score: 5, publishedAt: hoursAgo(1) },
      { id: 'd', score: 5, publishedAt: NOW },
    ];
    expect([...rows].sort(compareTrending).map((row) => row.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('trendingFeed — ranking on fixed fixture data', () => {
  it('ranks by score, not by recency', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    // Freshest, but nobody engaged with it beyond a single clap.
    const quiet = await makeStory({
      id: 'story-quiet',
      authorId: author.id,
      title: 'Quiet but new',
      publishedAt: hoursAgo(1),
    });
    // Older, heavily discussed. 4 comments × 3 = 12 engagement.
    const loud = await makeStory({
      id: 'story-loud',
      authorId: author.id,
      title: 'Older but loud',
      publishedAt: hoursAgo(48),
    });

    await testPrisma.clap.create({
      data: { userId: reader.id, storyId: quiet.id, count: 1, createdAt: hoursAgo(1) },
    });
    for (let i = 0; i < 4; i += 1) {
      await testPrisma.comment.create({
        data: {
          id: `comment-${i}`,
          storyId: loud.id,
          authorId: reader.id,
          bodyText: `Response ${i}`,
          createdAt: hoursAgo(2),
        },
      });
    }

    const feed = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });

    // quiet: 1 · 0.5^(1/72)  ≈ 0.990
    // loud: 12 · 0.5^(48/72) ≈ 7.56
    expect(feed.items.map((story) => story.title)).toEqual(['Older but loud', 'Quiet but new']);
    expect(feed.scope).toBe('trending');
  });

  it('ignores engagement from outside the 7-day window', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    const stale = await makeStory({
      id: 'story-stale',
      authorId: author.id,
      title: 'Lifetime totals',
      publishedAt: hoursAgo(6),
    });
    const fresh = await makeStory({
      id: 'story-fresh',
      authorId: author.id,
      title: 'This week',
      publishedAt: hoursAgo(6),
    });

    // 500 claps, but they landed 30 days ago: outside the window, worth nothing.
    await testPrisma.clap.create({
      data: { userId: reader.id, storyId: stale.id, count: 500, createdAt: daysAgo(30) },
    });
    await testPrisma.clap.create({
      data: { userId: reader.id, storyId: fresh.id, count: 2, createdAt: hoursAgo(3) },
    });

    const feed = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });

    expect(feed.items.map((story) => story.title)).toEqual(['This week']);
  });

  it('excludes stories with no in-window engagement at all', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id, title: 'Nobody clapped', publishedAt: hoursAgo(2) });

    const feed = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });

    expect(feed.items).toEqual([]);
    expect(feed.nextCursor).toBeNull();
  });

  it('never returns a draft, however much engagement it carries', async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const draft = await makeStory({
      id: 'story-draft',
      authorId: author.id,
      title: 'Popular draft',
      status: 'DRAFT',
    });
    await testPrisma.clap.create({
      data: { userId: reader.id, storyId: draft.id, count: 100, createdAt: hoursAgo(1) },
    });

    const feed = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });

    expect(feed.items).toEqual([]);
  });

  it('ignores soft-deleted comments as engagement', async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const story = await makeStory({
      id: 'story-tombstones',
      authorId: author.id,
      title: 'Deleted responses only',
      publishedAt: hoursAgo(2),
    });
    await testPrisma.comment.create({
      data: {
        id: 'deleted-1',
        storyId: story.id,
        authorId: reader.id,
        bodyText: 'gone',
        createdAt: hoursAgo(1),
        deletedAt: hoursAgo(1),
      },
    });

    const feed = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });

    expect(feed.items).toEqual([]);
  });

  it('produces the SAME order on repeated runs and cursor-pages that order', async () => {
    const author = await makeUser();
    const reader = await makeUser();

    // Engagement descending by index → deterministic, distinct scores.
    for (let i = 0; i < 5; i += 1) {
      const story = await makeStory({
        id: `story-t${i}`,
        authorId: author.id,
        title: `T${i}`,
        publishedAt: hoursAgo(4),
      });
      await testPrisma.clap.create({
        data: {
          userId: reader.id,
          storyId: story.id,
          count: 10 - i,
          createdAt: hoursAgo(1),
        },
      });
    }

    const run1 = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });
    const run2 = await trendingFeed(pageParams(), { now: NOW, db: testPrisma });
    expect(run1.items.map((s) => s.title)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4']);
    expect(run2.items.map((s) => s.title)).toEqual(run1.items.map((s) => s.title));

    const page1 = await trendingFeed(pageParams({ limit: 2 }), { now: NOW, db: testPrisma });
    expect(page1.items.map((s) => s.title)).toEqual(['T0', 'T1']);
    expect(page1.nextCursor).toBe('story-t1');

    const page2 = await trendingFeed(pageParams({ limit: 2, cursor: page1.nextCursor }), {
      now: NOW,
      db: testPrisma,
    });
    expect(page2.items.map((s) => s.title)).toEqual(['T2', 'T3']);
  });
});
