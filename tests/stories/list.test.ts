import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/stories/route';
import type { StoryDto } from '@/server/stories/serialize';
import type { Page } from '@/lib/pagination';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { buildRequest, callRoute, expectOk } from '../helpers/request';
import { cookieStore, signIn, signOut } from './helpers';

vi.mock('next/headers', async () => {
  const { cookieStore: jar } = await import('./helpers');
  return { cookies: async () => jar };
});
vi.mock('@/lib/db', async () => {
  const { testPrisma: db } = await import('../helpers/db');
  return { prisma: db, default: db };
});

/**
 * GET /api/stories — the author's own writing desk.
 *
 * This is NOT the public feed (Discovery owns that). It requires a session and
 * returns only the caller's own rows, drafts included. The two failure modes
 * worth guarding are leaking another author's drafts and returning an unbounded
 * list; both are asserted below.
 */
describe('GET /api/stories', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function list(query?: Record<string, string | number | undefined>) {
    return callRoute<Page<StoryDto>>(GET, await buildRequest('/api/stories', { query }));
  }

  it('returns 401 when signed out', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id });
    signOut();

    const result = await list();

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it("returns the caller's own stories, drafts included", async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id, status: 'DRAFT', title: 'My draft' });
    await makeStory({ authorId: author.id, status: 'PUBLISHED', title: 'My published' });
    await signIn(author);

    const page = expectOk(await list());

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items).toHaveLength(2);
    expect(page.items.map((story) => story.title).sort()).toEqual(['My draft', 'My published']);
  });

  it("never leaks another author's stories", async () => {
    const author = await makeUser();
    const other = await makeUser();
    await makeStory({ authorId: other.id, status: 'DRAFT', title: 'Their secret draft' });
    await makeStory({ authorId: other.id, status: 'PUBLISHED', title: 'Their published' });
    await makeStory({ authorId: author.id, title: 'Mine' });
    await signIn(author);

    const page = expectOk(await list());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe('Mine');
  });

  it('filters by status', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id, status: 'DRAFT', title: 'Draft one' });
    await makeStory({ authorId: author.id, status: 'DRAFT', title: 'Draft two' });
    await makeStory({ authorId: author.id, status: 'PUBLISHED', title: 'Published one' });
    await signIn(author);

    const drafts = expectOk(await list({ status: 'DRAFT' }));

    expect(drafts.items).toHaveLength(2);
    expect(drafts.items.every((story) => story.status === 'DRAFT')).toBe(true);
  });

  it('paginates with a cursor and never returns an unbounded list', async () => {
    const author = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      await makeStory({ authorId: author.id, title: `Story ${i}` });
    }
    await signIn(author);

    const first = expectOk(await list({ limit: 2 }));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = expectOk(await list({ limit: 2, cursor: first.nextCursor! }));
    expect(second.items).toHaveLength(2);

    const firstIds = first.items.map((story) => story.id);
    const secondIds = second.items.map((story) => story.id);
    // Pages must not overlap, or the reader sees duplicates.
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);

    const last = expectOk(await list({ limit: 2, cursor: second.nextCursor! }));
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });

  it('clamps an oversized limit to MAX_PAGE_SIZE instead of honouring it', async () => {
    const author = await makeUser();
    await makeStory({ authorId: author.id });
    await signIn(author);

    const page = expectOk(await list({ limit: 10_000 }));

    expect(page.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('returns 400 for an unknown status filter', async () => {
    const author = await makeUser();
    await signIn(author);

    const result = await list({ status: 'ARCHIVED' });

    expect(result.status).toBe(400);
  });

  it('returns an empty page, not an error, when the author has written nothing', async () => {
    const author = await makeUser();
    await signIn(author);

    const page = expectOk(await list());

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
