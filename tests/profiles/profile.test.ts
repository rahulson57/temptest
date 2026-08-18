import { describe, expect, it, vi } from 'vitest';
import { testPrisma } from '@tests/helpers/db';
import { makeStory, makeTag, makeUser } from '@tests/helpers/factories';

/** The profile loader reaches the DB through the prisma singleton. */
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { getProfileByHandle, listPublishedStoriesByAuthor, loadProfile } = await import(
  '@/server/profiles/profiles'
);

describe('getProfileByHandle', () => {
  it('resolves a handle to a public user', async () => {
    await makeUser({ handle: 'ada', displayName: 'Ada Lovelace', bio: 'Writes about engines.' });

    const user = await getProfileByHandle('ada');

    expect(user).toMatchObject({ handle: 'ada', displayName: 'Ada Lovelace' });
  });

  it('is case-insensitive and tolerates whitespace in the segment', async () => {
    await makeUser({ handle: 'ada' });

    await expect(getProfileByHandle(' ADA ')).resolves.toMatchObject({ handle: 'ada' });
  });

  it('never returns the password hash', async () => {
    await makeUser({ handle: 'ada' });

    const user = await getProfileByHandle('ada');

    expect(JSON.stringify(user)).not.toContain('passwordHash');
    expect(Object.keys(user)).not.toContain('passwordHash');
  });

  it('throws NOT_FOUND for an unknown handle — the page renders a 404', async () => {
    await makeUser({ handle: 'ada' });

    await expect(getProfileByHandle('nobody')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('listPublishedStoriesByAuthor — drafts are never visible', () => {
  it('returns published stories, most recent first', async () => {
    const author = await makeUser({ handle: 'ada' });
    const older = await makeStory({
      authorId: author.id,
      publishedAt: new Date('2024-01-01T00:00:00Z'),
    });
    const newer = await makeStory({
      authorId: author.id,
      publishedAt: new Date('2025-06-01T00:00:00Z'),
    });

    const page = await listPublishedStoriesByAuthor(author.id, { limit: 10 });

    expect(page.items.map((story) => story.id)).toEqual([newer.id, older.id]);
  });

  it('HIDES drafts', async () => {
    const author = await makeUser({ handle: 'ada' });
    const published = await makeStory({ authorId: author.id });
    const draft = await makeStory({ authorId: author.id, status: 'DRAFT' });

    const page = await listPublishedStoriesByAuthor(author.id, { limit: 10 });

    // Precondition: the draft really exists, so "not listed" means something.
    expect(await testPrisma.story.count({ where: { authorId: author.id } })).toBe(2);
    expect(page.items.map((story) => story.id)).toEqual([published.id]);
    expect(page.items.map((story) => story.id)).not.toContain(draft.id);
  });

  it('shows only THIS author’s stories', async () => {
    const author = await makeUser({ handle: 'ada' });
    const other = await makeUser({ handle: 'grace' });
    const mine = await makeStory({ authorId: author.id });
    await makeStory({ authorId: other.id });

    const page = await listPublishedStoriesByAuthor(author.id, { limit: 10 });

    expect(page.items.map((story) => story.id)).toEqual([mine.id]);
  });

  it('paginates with a cursor, without repeats or gaps', async () => {
    const author = await makeUser({ handle: 'ada' });
    const created = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(
        await makeStory({
          authorId: author.id,
          publishedAt: new Date(`2025-0${index + 1}-01T00:00:00Z`),
        }),
      );
    }
    expect(created.length).toBe(5); // precondition

    const first = await listPublishedStoriesByAuthor(author.id, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await listPublishedStoriesByAuthor(author.id, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    const third = await listPublishedStoriesByAuthor(author.id, {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });

    const ids = [...first.items, ...second.items, ...third.items].map((story) => story.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([...created].reverse().map((story) => story.id));
    expect(third.nextCursor).toBeNull();
  });

  it('clamps an absurd page size instead of dumping the table', async () => {
    const author = await makeUser({ handle: 'ada' });
    for (let index = 0; index < 3; index += 1) await makeStory({ authorId: author.id });

    const page = await listPublishedStoriesByAuthor(author.id, { limit: 10_000 });

    // MAX_PAGE_SIZE is 50; with 3 stories we just assert it did not throw and
    // returned them all — the clamp itself is unit-tested in tests/lib.
    expect(page.items).toHaveLength(3);
  });

  it('carries the counts and tags the profile card renders', async () => {
    const author = await makeUser({ handle: 'ada' });
    const reader = await makeUser({ handle: 'reader' });
    const tag = await makeTag({ name: 'Design' });
    const story = await makeStory({ authorId: author.id, tagIds: [tag.id] });
    await testPrisma.clap.create({ data: { userId: reader.id, storyId: story.id, count: 7 } });
    await testPrisma.comment.create({
      data: { storyId: story.id, authorId: reader.id, bodyText: 'Nice' },
    });

    const page = await listPublishedStoriesByAuthor(author.id, { limit: 10 });

    const [summary] = page.items;
    expect(summary).toBeDefined();
    expect(summary).toMatchObject({ clapCount: 7, commentCount: 1 });
    expect(summary?.tags.map((entry) => entry.name)).toEqual(['Design']);
    // The list surface must not ship whole story bodies.
    expect(Object.keys(summary ?? {})).not.toContain('bodyHtml');
  });
});

describe('loadProfile — what the page renders', () => {
  it('resolves counts, follow state and stories in one call', async () => {
    const author = await makeUser({ handle: 'ada', displayName: 'Ada' });
    const viewer = await makeUser({ handle: 'viewer' });
    const fan = await makeUser({ handle: 'fan' });
    const story = await makeStory({ authorId: author.id });

    await testPrisma.follow.create({ data: { followerId: viewer.id, followingId: author.id } });
    await testPrisma.follow.create({ data: { followerId: fan.id, followingId: author.id } });
    await testPrisma.follow.create({ data: { followerId: author.id, followingId: fan.id } });

    const { profile, stories } = await loadProfile('ada', viewer.id, { limit: 10 });

    expect(profile).toMatchObject({
      handle: 'ada',
      followerCount: 2,
      followingCount: 1,
      viewerIsFollowing: true,
      isViewer: false,
    });
    expect(stories.items.map((entry) => entry.id)).toEqual([story.id]);
  });

  it('reports viewerIsFollowing false for a signed-out visitor', async () => {
    await makeUser({ handle: 'ada' });

    const { profile } = await loadProfile('ada', null, { limit: 10 });

    expect(profile.viewerIsFollowing).toBe(false);
    expect(profile.isViewer).toBe(false);
  });

  it('marks the viewer’s own profile so it offers Edit, not Follow', async () => {
    const ada = await makeUser({ handle: 'ada' });

    const { profile } = await loadProfile('ada', ada.id, { limit: 10 });

    expect(profile.isViewer).toBe(true);
    expect(profile.viewerIsFollowing).toBe(false);
  });

  it('hides the author’s own drafts even from the author', async () => {
    // The profile is a public surface. /drafts is where an author sees drafts.
    const ada = await makeUser({ handle: 'ada' });
    await makeStory({ authorId: ada.id, status: 'DRAFT' });
    const published = await makeStory({ authorId: ada.id });

    const { stories } = await loadProfile('ada', ada.id, { limit: 10 });

    expect(stories.items.map((entry) => entry.id)).toEqual([published.id]);
  });

  it('throws NOT_FOUND for an unknown handle', async () => {
    await expect(loadProfile('nobody', null, { limit: 10 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('returns an empty story page for a writer who has published nothing', async () => {
    await makeUser({ handle: 'ada' });

    const { profile, stories } = await loadProfile('ada', null, { limit: 10 });

    expect(profile.handle).toBe('ada');
    expect(stories.items).toEqual([]);
    expect(stories.nextCursor).toBeNull();
  });
});
