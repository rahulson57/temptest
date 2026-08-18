import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { globalFeed } from '@/server/feed/queries';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageParams } from '@/lib/pagination';

/**
 * GLOBAL FEED — the signed-out home page.
 *
 * Three things are load-bearing and each gets its own test: newest-first order,
 * drafts never appearing, and a cursor that walks the whole archive without
 * repeating or skipping a row.
 */

/** Fixed clock. Nothing here may depend on the wall clock. */
const T0 = new Date('2025-03-01T12:00:00.000Z');
const at = (hoursAgo: number) => new Date(T0.getTime() - hoursAgo * 3_600_000);

beforeEach(() => {
  resetFactoryCounter();
});

describe('globalFeed — ordering', () => {
  it('returns published stories newest-first', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id, title: 'Oldest', publishedAt: at(72) });
    await makeStory({ authorId: author.id, title: 'Newest', publishedAt: at(1) });
    await makeStory({ authorId: author.id, title: 'Middle', publishedAt: at(24) });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items.map((story) => story.title)).toEqual(['Newest', 'Middle', 'Oldest']);
    expect(feed.scope).toBe('global');
    expect(feed.fallback).toBe(false);
  });

  it('hydrates author, tags and engagement counts on every row', async () => {
    const author = await makeUser({ displayName: 'Ada Lovelace', handle: 'ada' });
    const reader = await makeUser();
    const tag = await testPrisma.tag.create({ data: { id: 'tag-x', name: 'Design', slug: 'design' } });
    const story = await makeStory({ authorId: author.id, tagIds: [tag.id] });
    await testPrisma.clap.create({ data: { userId: reader.id, storyId: story.id, count: 7 } });
    await testPrisma.comment.create({
      data: { id: 'c1', storyId: story.id, authorId: reader.id, bodyText: 'Nice' },
    });

    const feed = await globalFeed(pageParams(), testPrisma);
    const [item] = feed.items;

    expect(item).toBeDefined();
    expect(item?.author.displayName).toBe('Ada Lovelace');
    expect(item?.tags.map((t) => t.slug)).toEqual(['design']);
    // Clap.count is claps-per-user, so the visible total is a SUM, not a row count.
    expect(item?.clapCount).toBe(7);
    expect(item?.commentCount).toBe(1);
  });

  it('counts claps as a sum across users, not a row count', async () => {
    const story = await makeStory();
    const a = await makeUser();
    const b = await makeUser();
    await testPrisma.clap.create({ data: { userId: a.id, storyId: story.id, count: 30 } });
    await testPrisma.clap.create({ data: { userId: b.id, storyId: story.id, count: 12 } });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items[0]?.clapCount).toBe(42);
  });

  it('does not count soft-deleted comments', async () => {
    const story = await makeStory();
    const commenter = await makeUser();
    await testPrisma.comment.create({
      data: { id: 'live', storyId: story.id, authorId: commenter.id, bodyText: 'Visible' },
    });
    await testPrisma.comment.create({
      data: {
        id: 'gone',
        storyId: story.id,
        authorId: commenter.id,
        bodyText: 'Removed',
        deletedAt: T0,
      },
    });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items[0]?.commentCount).toBe(1);
  });
});

describe('globalFeed — drafts', () => {
  it('never returns a DRAFT story', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id, title: 'Published', publishedAt: at(2) });
    await makeStory({ authorId: author.id, title: 'Secret draft', status: 'DRAFT' });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items).toHaveLength(1);
    expect(feed.items.map((story) => story.title)).toEqual(['Published']);
    expect(feed.items.every((story) => story.status === 'PUBLISHED')).toBe(true);
  });

  it('excludes a PUBLISHED row with a null publishedAt (half-published data)', async () => {
    const story = await makeStory({ title: 'Inconsistent' });
    await testPrisma.story.update({ where: { id: story.id }, data: { publishedAt: null } });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items).toHaveLength(0);
  });

  it('returns an empty page, not an error, when nothing is published', async () => {
    await makeStory({ status: 'DRAFT' });

    const feed = await globalFeed(pageParams(), testPrisma);

    expect(feed.items).toEqual([]);
    expect(feed.nextCursor).toBeNull();
  });
});

describe('globalFeed — cursor pagination', () => {
  it('walks the whole archive without repeating or skipping a story', async () => {
    const author = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      await makeStory({ authorId: author.id, title: `Story ${i}`, publishedAt: at(i) });
    }

    const first = await globalFeed(pageParams({ limit: 2 }), testPrisma);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1]?.id);

    const second = await globalFeed(
      pageParams({ limit: 2, cursor: first.nextCursor }),
      testPrisma,
    );
    expect(second.items).toHaveLength(2);

    const third = await globalFeed(
      pageParams({ limit: 2, cursor: second.nextCursor }),
      testPrisma,
    );
    expect(third.items).toHaveLength(1);
    // Last page: no cursor, so the UI shows "you're all caught up".
    expect(third.nextCursor).toBeNull();

    const seen = [...first.items, ...second.items, ...third.items];
    expect(new Set(seen.map((story) => story.id)).size).toBe(5);
    // And still globally newest-first ACROSS page boundaries: story 0 was
    // published most recently (at(0)), story 4 longest ago (at(4)).
    expect(seen.map((story) => story.title)).toEqual([
      'Story 0',
      'Story 1',
      'Story 2',
      'Story 3',
      'Story 4',
    ]);
  });

  it('defaults to DEFAULT_PAGE_SIZE and clamps to MAX_PAGE_SIZE', async () => {
    const author = await makeUser();
    for (let i = 0; i < DEFAULT_PAGE_SIZE + 3; i += 1) {
      await makeStory({ authorId: author.id, publishedAt: at(i) });
    }

    const defaulted = await globalFeed(pageParams(), testPrisma);
    expect(defaulted.items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(defaulted.nextCursor).not.toBeNull();

    // A caller asking for 1000 gets MAX_PAGE_SIZE worth of capacity, not 1000.
    const clamped = await globalFeed(pageParams({ limit: 1000 }), testPrisma);
    expect(clamped.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(clamped.items).toHaveLength(DEFAULT_PAGE_SIZE + 3);
  });
});
