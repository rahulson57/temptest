import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { makeStory, makeTag, makeUser, resetFactoryCounter } from '../helpers/factories';
import { personalFeed } from '@/server/feed/queries';
import { pageParams } from '@/lib/pagination';

/**
 * PERSONALIZED FEED — stories from authors you follow UNION stories carrying
 * tags you follow.
 *
 * The union is a single SQL OR, which is what makes it deduplicated: a story
 * that qualifies on BOTH counts is one row, not two. These tests pin that, the
 * ordering, the draft exclusion, and — the subtle one — exactly WHEN the empty
 * set falls back to the global feed.
 */

const T0 = new Date('2025-03-01T12:00:00.000Z');
const at = (hoursAgo: number) => new Date(T0.getTime() - hoursAgo * 3_600_000);

const follow = (followerId: string, followingId: string) =>
  testPrisma.follow.create({ data: { followerId, followingId } });

const followTag = (userId: string, tagId: string) =>
  testPrisma.tagFollow.create({ data: { userId, tagId } });

beforeEach(() => {
  resetFactoryCounter();
});

describe('personalFeed — the union', () => {
  it('includes stories from authors the reader follows', async () => {
    const reader = await makeUser({ handle: 'reader' });
    const followed = await makeUser({ handle: 'followed' });
    const stranger = await makeUser({ handle: 'stranger' });

    await follow(reader.id, followed.id);
    await makeStory({ authorId: followed.id, title: 'From a followed author', publishedAt: at(1) });
    await makeStory({ authorId: stranger.id, title: 'From a stranger', publishedAt: at(2) });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.scope).toBe('personal');
    expect(feed.fallback).toBe(false);
    expect(feed.items.map((story) => story.title)).toEqual(['From a followed author']);
  });

  it('includes stories carrying tags the reader follows, by any author', async () => {
    const reader = await makeUser();
    const stranger = await makeUser();
    const tag = await makeTag({ name: 'Typography', slug: 'typography' });
    const otherTag = await makeTag({ name: 'Ships', slug: 'ships' });

    await followTag(reader.id, tag.id);
    await makeStory({
      authorId: stranger.id,
      title: 'Tagged, followed topic',
      tagIds: [tag.id],
      publishedAt: at(1),
    });
    await makeStory({
      authorId: stranger.id,
      title: 'Tagged, unfollowed topic',
      tagIds: [otherTag.id],
      publishedAt: at(2),
    });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.items.map((story) => story.title)).toEqual(['Tagged, followed topic']);
  });

  it('DEDUPLICATES a story that matches on BOTH a followed author and a followed tag', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    const tag = await makeTag({ name: 'Both', slug: 'both' });

    await follow(reader.id, author.id);
    await followTag(reader.id, tag.id);
    await makeStory({
      id: 'story-both',
      authorId: author.id,
      title: 'Qualifies twice',
      tagIds: [tag.id],
      publishedAt: at(1),
    });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.items).toHaveLength(1);
    expect(feed.items.map((story) => story.id)).toEqual(['story-both']);
  });

  it('merges both sources in one newest-first order, not source-by-source', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    const stranger = await makeUser();
    const tag = await makeTag({ name: 'Merged', slug: 'merged' });

    await follow(reader.id, author.id);
    await followTag(reader.id, tag.id);

    await makeStory({ authorId: author.id, title: 'Author, old', publishedAt: at(30) });
    await makeStory({
      authorId: stranger.id,
      title: 'Tag, newest',
      tagIds: [tag.id],
      publishedAt: at(1),
    });
    await makeStory({ authorId: author.id, title: 'Author, middle', publishedAt: at(10) });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.items.map((story) => story.title)).toEqual([
      'Tag, newest',
      'Author, middle',
      'Author, old',
    ]);
  });

  it('never includes a draft, even from a followed author', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    await follow(reader.id, author.id);
    await makeStory({ authorId: author.id, title: 'Published', publishedAt: at(1) });
    await makeStory({ authorId: author.id, title: 'Draft', status: 'DRAFT' });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.items.map((story) => story.title)).toEqual(['Published']);
  });
});

describe('personalFeed — fallback to the global feed', () => {
  it('falls back when the reader follows nobody and no topic', async () => {
    const reader = await makeUser();
    const stranger = await makeUser();
    await makeStory({ authorId: stranger.id, title: 'Everyone can see this', publishedAt: at(1) });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.fallback).toBe(true);
    // The scope stays `personal` — the UI must know the reader ASKED for
    // personal so it can explain the substitution instead of hiding it.
    expect(feed.scope).toBe('personal');
    expect(feed.items.map((story) => story.title)).toEqual(['Everyone can see this']);
  });

  it('falls back when follows exist but have published nothing', async () => {
    const reader = await makeUser();
    const silent = await makeUser();
    const stranger = await makeUser();
    await follow(reader.id, silent.id);
    await makeStory({ authorId: silent.id, title: 'Their unfinished draft', status: 'DRAFT' });
    await makeStory({ authorId: stranger.id, title: 'Global story', publishedAt: at(1) });

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.fallback).toBe(true);
    expect(feed.items.map((story) => story.title)).toEqual(['Global story']);
  });

  it('does NOT fall back on a later page — running out means "all caught up"', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    const stranger = await makeUser();
    await follow(reader.id, author.id);

    await makeStory({ authorId: author.id, title: 'Followed A', publishedAt: at(1) });
    await makeStory({ authorId: author.id, title: 'Followed B', publishedAt: at(2) });
    await makeStory({ authorId: stranger.id, title: 'Stranger story', publishedAt: at(3) });

    const first = await personalFeed(reader.id, pageParams({ limit: 2 }), testPrisma);
    expect(first.items.map((story) => story.title)).toEqual(['Followed A', 'Followed B']);
    expect(first.fallback).toBe(false);
    // Exactly two matching rows and a limit of 2: there is no lookahead row.
    expect(first.nextCursor).toBeNull();

    // Simulate a stale/handed-around cursor pointing past the end.
    const second = await personalFeed(
      reader.id,
      pageParams({ limit: 2, cursor: first.items[1]?.id }),
      testPrisma,
    );
    expect(second.items).toEqual([]);
    expect(second.fallback).toBe(false);
    // The stranger's story must NOT leak in as a page-2 "fallback".
    expect(second.items.map((story) => story.title)).not.toContain('Stranger story');
  });

  it('returns an empty fallback page when the whole site is empty', async () => {
    const reader = await makeUser();

    const feed = await personalFeed(reader.id, pageParams(), testPrisma);

    expect(feed.items).toEqual([]);
    expect(feed.fallback).toBe(true);
    expect(feed.nextCursor).toBeNull();
  });
});

describe('personalFeed — pagination', () => {
  it('cursor-pages the personalized set without repeats', async () => {
    const reader = await makeUser();
    const author = await makeUser();
    await follow(reader.id, author.id);
    for (let i = 0; i < 5; i += 1) {
      await makeStory({ authorId: author.id, title: `P${i}`, publishedAt: at(i) });
    }

    const first = await personalFeed(reader.id, pageParams({ limit: 2 }), testPrisma);
    const second = await personalFeed(
      reader.id,
      pageParams({ limit: 2, cursor: first.nextCursor }),
      testPrisma,
    );
    const third = await personalFeed(
      reader.id,
      pageParams({ limit: 2, cursor: second.nextCursor }),
      testPrisma,
    );

    const titles = [...first.items, ...second.items, ...third.items].map((s) => s.title);
    expect(titles).toEqual(['P0', 'P1', 'P2', 'P3', 'P4']);
    expect(third.nextCursor).toBeNull();
  });
});
