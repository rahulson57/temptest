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
import type { PublicUser } from '@/lib/types';

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { GET: ME } = await import('@/app/api/auth/me/route');
const { PATCH: PATCH_PROFILE } = await import('@/app/api/profiles/me/route');
const { POST: CLAP } = await import('@/app/api/social/clap/[storyId]/route');
const { POST: BOOKMARK } = await import('@/app/api/social/bookmark/[storyId]/route');
const { POST: FOLLOW } = await import('@/app/api/social/follow/[userId]/route');
const { POST: FOLLOW_TAG } = await import('@/app/api/social/follow-tag/[tagId]/route');

beforeEach(() => {
  cookieStore.clear();
});

describe('GET /api/auth/me — the reference authenticated-only route', () => {
  it('rejects a signed-out request with 401', async () => {
    await makeUser();

    const result = await callRoute(ME, await buildRequest('/api/auth/me'));

    expect(result.status).toBe(401);
    expect(result.body.ok).toBe(false);
    if (result.body.ok === false) expect(result.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the viewer when signed in', async () => {
    const user = await makeUser({ handle: 'ada', email: 'ada@example.com' });
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));

    const result = await callRoute<{ user: PublicUser }>(ME, await buildRequest('/api/auth/me'));

    expect(result.status).toBe(200);
    expect(expectOk(result).user.handle).toBe('ada');
  });

  it('never leaks the password hash', async () => {
    const user = await makeUser();
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));

    const result = await callRoute(ME, await buildRequest('/api/auth/me'));

    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
  });

  it('rejects an expired session with 401', async () => {
    const user = await makeUser();
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user, -60));

    expect((await callRoute(ME, await buildRequest('/api/auth/me'))).status).toBe(401);
  });

  it('rejects a forged/garbage cookie with 401', async () => {
    cookieStore.set(SESSION_COOKIE_NAME, 'eyJhbGciOiJIUzI1NiJ9.forged.signature');

    expect((await callRoute(ME, await buildRequest('/api/auth/me'))).status).toBe(401);
  });

  it('rejects a valid token whose user row is gone', async () => {
    // getCurrentUser() re-reads the user row instead of trusting JWT claims, so
    // a deleted account is signed out immediately rather than at token expiry.
    const user = await makeUser();
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
    await testPrisma.user.delete({ where: { id: user.id } });

    expect((await callRoute(ME, await buildRequest('/api/auth/me'))).status).toBe(401);
  });
});

describe('every mutation in this vertical rejects a signed-out request', () => {
  it('returns 401 — not 404, not 400 — before touching the database', async () => {
    // Order matters: requireUser() runs BEFORE id validation and before the
    // existence lookup. A signed-out request for a nonexistent story must say
    // 401, never 404 — otherwise the endpoint becomes an oracle that tells an
    // anonymous caller which story ids exist.
    const cases: { name: string; run: () => Promise<{ status: number }> }[] = [
      {
        name: 'PATCH /api/profiles/me',
        run: async () =>
          callRoute(
            PATCH_PROFILE,
            await buildRequest('/api/profiles/me', { method: 'PATCH', body: { bio: 'hi' } }),
          ),
      },
      {
        name: 'POST /api/social/clap/[storyId]',
        run: async () =>
          callRoute(
            CLAP,
            await buildRequest('/api/social/clap/does-not-exist', { body: { count: 1 } }),
            routeContext({ storyId: 'does-not-exist' }),
          ),
      },
      {
        name: 'POST /api/social/bookmark/[storyId]',
        run: async () =>
          callRoute(
            BOOKMARK,
            await buildRequest('/api/social/bookmark/does-not-exist', { method: 'POST' }),
            routeContext({ storyId: 'does-not-exist' }),
          ),
      },
      {
        name: 'POST /api/social/follow/[userId]',
        run: async () =>
          callRoute(
            FOLLOW,
            await buildRequest('/api/social/follow/does-not-exist', { method: 'POST' }),
            routeContext({ userId: 'does-not-exist' }),
          ),
      },
      {
        name: 'POST /api/social/follow-tag/[tagId]',
        run: async () =>
          callRoute(
            FOLLOW_TAG,
            await buildRequest('/api/social/follow-tag/does-not-exist', { method: 'POST' }),
            routeContext({ tagId: 'does-not-exist' }),
          ),
      },
    ];

    // Assert the set is non-empty before asserting over it — a loop over zero
    // cases is a test that cannot fail.
    expect(cases.length).toBeGreaterThan(0);

    for (const { name, run } of cases) {
      expect({ name, status: (await run()).status }).toEqual({ name, status: 401 });
    }
  });

  it('writes nothing while signed out', async () => {
    const story = await makeStory();

    await callRoute(
      CLAP,
      await buildRequest(`/api/social/clap/${story.id}`, { body: { count: 5 } }),
      routeContext({ storyId: story.id }),
    );
    await callRoute(
      BOOKMARK,
      await buildRequest(`/api/social/bookmark/${story.id}`, { method: 'POST' }),
      routeContext({ storyId: story.id }),
    );

    expect(await testPrisma.clap.count()).toBe(0);
    expect(await testPrisma.bookmark.count()).toBe(0);
  });
});
