import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { testPrisma } from '@tests/helpers/db';
import { makeStory, makeUser } from '@tests/helpers/factories';
import { sessionTokenFor } from '@tests/helpers/auth';
import {
  buildRequest,
  callRoute,
  createCookieStoreMock,
  expectOk,
  routeContext,
} from '@tests/helpers/request';
import { listBookmarkedStories } from '@/server/social/bookmarks';

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST, DELETE } = await import('@/app/api/social/bookmark/[storyId]/route');

type BookmarkState = { bookmarked: boolean };

async function signIn(user: { id: string; email: string; handle: string }) {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

async function save(storyId: string) {
  return callRoute<BookmarkState>(
    POST,
    await buildRequest(`/api/social/bookmark/${storyId}`, { method: 'POST' }),
    routeContext({ storyId }),
  );
}

async function unsave(storyId: string) {
  return callRoute<BookmarkState>(
    DELETE,
    await buildRequest(`/api/social/bookmark/${storyId}`, { method: 'DELETE' }),
    routeContext({ storyId }),
  );
}

/** Bookmarks carry createdAt; the reading list orders on it, so control it. */
async function setSavedAt(userId: string, storyId: string, iso: string) {
  await testPrisma.bookmark.update({
    where: { userId_storyId: { userId, storyId } },
    data: { createdAt: new Date(iso) },
  });
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST/DELETE /api/social/bookmark/[storyId] — idempotent toggle', () => {
  it('saves a story', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const result = await save(story.id);

    expect(result.status).toBe(200);
    expect(expectOk(result)).toEqual({ bookmarked: true });
    expect(await testPrisma.bookmark.count()).toBe(1);
  });

  it('is idempotent: saving twice leaves exactly one row', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const first = await save(story.id);
    const second = await save(story.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(expectOk(second)).toEqual(expectOk(first));
    expect(await testPrisma.bookmark.count()).toBe(1);
  });

  it('is idempotent: un-saving twice succeeds', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);
    await save(story.id);
    expect(await testPrisma.bookmark.count()).toBe(1); // precondition

    const first = await unsave(story.id);
    const second = await unsave(story.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(expectOk(second)).toEqual({ bookmarked: false });
    expect(await testPrisma.bookmark.count()).toBe(0);
  });

  it('un-saving something never saved is a success, not a 404', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    expect((await unsave(story.id)).status).toBe(200);
  });

  it('keeps one reader’s bookmarks out of another’s', async () => {
    const one = await makeUser({ handle: 'one' });
    const two = await makeUser({ handle: 'two' });
    const story = await makeStory();

    await signIn(one);
    await save(story.id);
    await signIn(two);
    await unsave(story.id);

    // Reader two removing "their" bookmark must not touch reader one's.
    expect(
      await testPrisma.bookmark.findUnique({
        where: { userId_storyId: { userId: one.id, storyId: story.id } },
      }),
    ).not.toBeNull();
  });
});

describe('POST/DELETE /api/social/bookmark/[storyId] — rejections', () => {
  it('rejects a signed-out save with 401 and writes nothing', async () => {
    const story = await makeStory();

    expect((await save(story.id)).status).toBe(401);
    expect(await testPrisma.bookmark.count()).toBe(0);
  });

  it('rejects a signed-out un-save with 401', async () => {
    const story = await makeStory();

    expect((await unsave(story.id)).status).toBe(401);
  });

  it('returns 404 for an unknown story id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await save('no-such-story')).status).toBe(404);
    expect(await testPrisma.bookmark.count()).toBe(0);
  });

  it('returns 400 for an empty story id segment', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await save('')).status).toBe(400);
  });
});

describe('the reading list', () => {
  it('lists saved stories NEWEST-SAVED first, not newest-published', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    // Published oldest → newest.
    const old = await makeStory({ publishedAt: new Date('2020-01-01T00:00:00Z') });
    const middle = await makeStory({ publishedAt: new Date('2022-01-01T00:00:00Z') });
    const recent = await makeStory({ publishedAt: new Date('2024-01-01T00:00:00Z') });

    // Saved in a DIFFERENT order, so publish order cannot accidentally pass.
    await save(middle.id);
    await setSavedAt(viewer.id, middle.id, '2025-01-01T00:00:00Z');
    await save(recent.id);
    await setSavedAt(viewer.id, recent.id, '2025-01-02T00:00:00Z');
    await save(old.id);
    await setSavedAt(viewer.id, old.id, '2025-01-03T00:00:00Z');

    const page = await listBookmarkedStories(viewer.id, { limit: 10 });

    expect(page.items.length).toBe(3);
    expect(page.items.map((story) => story.id)).toEqual([old.id, recent.id, middle.id]);
  });

  it('is empty for a reader who has saved nothing', async () => {
    const viewer = await makeUser({ handle: 'viewer' });

    const page = await listBookmarkedStories(viewer.id, { limit: 10 });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('shows only the viewer’s own saves', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const other = await makeUser({ handle: 'other' });
    const mine = await makeStory();
    const theirs = await makeStory();

    await signIn(viewer);
    await save(mine.id);
    await signIn(other);
    await save(theirs.id);

    const page = await listBookmarkedStories(viewer.id, { limit: 10 });

    expect(page.items.map((story) => story.id)).toEqual([mine.id]);
  });

  it('excludes a story that was unpublished after being saved', async () => {
    // A reading list is not a licence to read someone's draft.
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);
    await save(story.id);
    expect((await listBookmarkedStories(viewer.id, { limit: 10 })).items.length).toBe(1);

    await testPrisma.story.update({
      where: { id: story.id },
      data: { status: 'DRAFT', publishedAt: null },
    });

    expect((await listBookmarkedStories(viewer.id, { limit: 10 })).items).toEqual([]);
  });

  it('paginates with a cursor and never repeats or drops a story', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    const stories = [];
    for (let index = 0; index < 5; index += 1) {
      const story = await makeStory();
      await save(story.id);
      await setSavedAt(viewer.id, story.id, `2025-01-0${index + 1}T00:00:00Z`);
      stories.push(story);
    }
    expect(stories.length).toBe(5); // precondition

    const first = await listBookmarkedStories(viewer.id, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await listBookmarkedStories(viewer.id, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    const third = await listBookmarkedStories(viewer.id, {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });

    const seen = [...first.items, ...second.items, ...third.items].map((story) => story.id);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    // Newest-saved first: stories were saved in ascending date order.
    expect(seen).toEqual([...stories].reverse().map((story) => story.id));
    expect(third.nextCursor).toBeNull();
  });
});
