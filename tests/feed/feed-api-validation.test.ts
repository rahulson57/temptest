import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequest,
  callRoute,
  createCookieStoreMock,
  expectOk,
} from '../helpers/request';
import { sessionTokenFor } from '../helpers/auth';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { testPrisma } from '../helpers/db';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import type { StorySummary } from '@/lib/types';

/**
 * GET /api/feed — the contract at the boundary.
 *
 * Two rules the criteria call out explicitly:
 *   - invalid `scope` or `limit` → 400 (never a silent clamp)
 *   - `scope=personal` while signed out → 401 (never a quiet downgrade to global)
 *
 * `next/headers` reads request-scoped AsyncLocalStorage that only exists inside
 * a real Next request, so the cookie store is doubled here — every other layer
 * (JWT signing, verification, the Prisma read) is the real thing.
 */

const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

const { GET } = await import('@/app/api/feed/route');

type FeedBody = {
  scope: string;
  fallback: boolean;
  items: StorySummary[];
  nextCursor: string | null;
};

async function get(query: Record<string, string | number | undefined>) {
  return callRoute<FeedBody>(GET, await buildRequest('/api/feed', { query }));
}

beforeEach(() => {
  cookieStore.clear();
  resetFactoryCounter();
});

describe('GET /api/feed — invalid input is a 400', () => {
  it('rejects an unknown scope', async () => {
    const result = await get({ scope: 'everything' });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['non-numeric', 'lots'],
    ['fractional', '2.5'],
    ['above the maximum', String(MAX_PAGE_SIZE + 1)],
  ])('rejects a %s limit', async (_label, limit) => {
    const result = await get({ scope: 'global', limit });

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
  });

  it('accepts the maximum limit exactly', async () => {
    const result = await get({ scope: 'global', limit: MAX_PAGE_SIZE });

    expect(result.status).toBe(200);
  });

  it('reports which parameter was wrong', async () => {
    const result = await get({ scope: 'global', limit: '999' });

    expect(result.body.ok).toBe(false);
    if (result.body.ok === false) {
      expect(result.body.error.message).toContain('limit');
    }
  });
});

describe('GET /api/feed — scope=personal requires a session', () => {
  it('401s when signed out', async () => {
    const result = await get({ scope: 'personal' });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('401s rather than silently serving the global feed', async () => {
    await makeStory({ title: 'A public story' });

    const result = await get({ scope: 'personal' });

    expect(result.status).toBe(401);
    // The important half: no story data leaked under an unauthorized answer.
    expect(JSON.stringify(result.body)).not.toContain('A public story');
  });

  it('401s on a signature that does not verify', async () => {
    cookieStore.set('session', 'not-a-real-jwt');

    const result = await get({ scope: 'personal' });

    expect(result.status).toBe(401);
  });

  it('200s for a signed-in reader', async () => {
    const reader = await makeUser({ handle: 'reader' });
    const author = await makeUser({ handle: 'author' });
    await testPrisma.follow.create({ data: { followerId: reader.id, followingId: author.id } });
    await makeStory({ authorId: author.id, title: 'From someone I follow' });

    cookieStore.set('session', await sessionTokenFor(reader));
    const result = await get({ scope: 'personal' });

    expect(result.status).toBe(200);
    const data = expectOk(result);
    expect(data.scope).toBe('personal');
    expect(data.fallback).toBe(false);
    expect(data.items.map((story) => story.title)).toEqual(['From someone I follow']);
  });
});

describe('GET /api/feed — the happy paths', () => {
  it('defaults to the global scope with no parameters at all', async () => {
    await makeStory({ title: 'Default scope story' });

    const result = await get({});

    expect(result.status).toBe(200);
    const data = expectOk(result);
    expect(data.scope).toBe('global');
    expect(data.items.map((story) => story.title)).toEqual(['Default scope story']);
  });

  it('is always paginated: honours limit and returns a cursor', async () => {
    const author = await makeUser();
    const base = new Date('2025-03-01T12:00:00.000Z').getTime();
    for (let i = 0; i < 4; i += 1) {
      await makeStory({
        authorId: author.id,
        title: `S${i}`,
        publishedAt: new Date(base - i * 3_600_000),
      });
    }

    const first = await get({ scope: 'global', limit: 2 });
    const firstData = expectOk(first);
    expect(firstData.items.map((s) => s.title)).toEqual(['S0', 'S1']);
    expect(firstData.nextCursor).not.toBeNull();

    const second = await get({
      scope: 'global',
      limit: 2,
      cursor: firstData.nextCursor ?? undefined,
    });
    const secondData = expectOk(second);
    expect(secondData.items.map((s) => s.title)).toEqual(['S2', 'S3']);
    expect(secondData.nextCursor).toBeNull();
  });

  it('serves the trending scope without a session', async () => {
    const result = await get({ scope: 'trending' });

    expect(result.status).toBe(200);
    expect(expectOk(result).scope).toBe('trending');
  });

  it('never returns a draft through the API', async () => {
    await makeStory({ title: 'Draft story', status: 'DRAFT' });

    const result = await get({ scope: 'global' });

    expect(expectOk(result).items).toEqual([]);
  });

  it('flags the fallback when a signed-in reader follows nobody', async () => {
    const reader = await makeUser({ handle: 'lonely' });
    await makeStory({ title: 'Everyone sees this' });

    cookieStore.set('session', await sessionTokenFor(reader));
    const result = await get({ scope: 'personal' });

    const data = expectOk(result);
    expect(data.scope).toBe('personal');
    expect(data.fallback).toBe(true);
    expect(data.items.map((story) => story.title)).toEqual(['Everyone sees this']);
  });
});
