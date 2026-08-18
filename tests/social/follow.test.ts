import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { testPrisma } from '@tests/helpers/db';
import { makeUser } from '@tests/helpers/factories';
import { sessionTokenFor } from '@tests/helpers/auth';
import {
  buildRequest,
  callRoute,
  createCookieStoreMock,
  expectOk,
  routeContext,
} from '@tests/helpers/request';

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST, DELETE } = await import('@/app/api/social/follow/[userId]/route');

type FollowState = { following: boolean; followerCount: number };

async function signIn(user: { id: string; email: string; handle: string }) {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

async function follow(userId: string) {
  return callRoute<FollowState>(
    POST,
    await buildRequest(`/api/social/follow/${userId}`, { method: 'POST' }),
    routeContext({ userId }),
  );
}

async function unfollow(userId: string) {
  return callRoute<FollowState>(
    DELETE,
    await buildRequest(`/api/social/follow/${userId}`, { method: 'DELETE' }),
    routeContext({ userId }),
  );
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST/DELETE /api/social/follow/[userId] — idempotency', () => {
  it('follows a writer and reports the new state', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const author = await makeUser({ handle: 'author' });
    await signIn(viewer);

    const result = await follow(author.id);

    expect(result.status).toBe(200);
    expect(expectOk(result)).toEqual({ following: true, followerCount: 1 });
    expect(await testPrisma.follow.count()).toBe(1);
  });

  it('is idempotent: following twice leaves exactly one row', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const author = await makeUser({ handle: 'author' });
    await signIn(viewer);

    const first = await follow(author.id);
    const second = await follow(author.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(expectOk(second)).toEqual(expectOk(first));
    expect(await testPrisma.follow.count()).toBe(1);
  });

  it('is idempotent: unfollowing twice succeeds and leaves no row', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const author = await makeUser({ handle: 'author' });
    await signIn(viewer);
    await follow(author.id);
    // Precondition — otherwise "no rows afterwards" is trivially true.
    expect(await testPrisma.follow.count()).toBe(1);

    const first = await unfollow(author.id);
    const second = await unfollow(author.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(expectOk(second)).toEqual({ following: false, followerCount: 0 });
    expect(await testPrisma.follow.count()).toBe(0);
  });

  it('unfollowing someone you never followed is a success, not a 404', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const author = await makeUser({ handle: 'author' });
    await signIn(viewer);

    const result = await unfollow(author.id);

    expect(result.status).toBe(200);
    expect(expectOk(result).following).toBe(false);
  });

  it('keeps follows directional — A following B is not B following A', async () => {
    const a = await makeUser({ handle: 'a_user' });
    const b = await makeUser({ handle: 'b_user' });
    await signIn(a);
    await follow(b.id);

    const forward = await testPrisma.follow.findUnique({
      where: { followerId_followingId: { followerId: a.id, followingId: b.id } },
    });
    const backward = await testPrisma.follow.findUnique({
      where: { followerId_followingId: { followerId: b.id, followingId: a.id } },
    });

    expect(forward).not.toBeNull();
    expect(backward).toBeNull();
  });

  it('counts followers from every user, not just the viewer', async () => {
    const author = await makeUser({ handle: 'author' });
    const one = await makeUser({ handle: 'one' });
    const two = await makeUser({ handle: 'two' });

    await signIn(one);
    await follow(author.id);
    await signIn(two);
    const result = await follow(author.id);

    expect(expectOk(result)).toEqual({ following: true, followerCount: 2 });
  });
});

describe('POST/DELETE /api/social/follow/[userId] — rejections', () => {
  it('rejects a self-follow with 400 and writes nothing', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    const result = await follow(viewer.id);

    expect(result.status).toBe(400);
    expect(await testPrisma.follow.count()).toBe(0);
  });

  it('rejects a self-UNfollow with 400 too', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await unfollow(viewer.id)).status).toBe(400);
  });

  it('rejects a signed-out follow with 401', async () => {
    const author = await makeUser({ handle: 'author' });

    const result = await follow(author.id);

    expect(result.status).toBe(401);
    expect(await testPrisma.follow.count()).toBe(0);
  });

  it('rejects a signed-out unfollow with 401', async () => {
    const author = await makeUser({ handle: 'author' });

    expect((await unfollow(author.id)).status).toBe(401);
  });

  it('returns 404 for an unknown user id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    const result = await follow('no-such-user-id');

    expect(result.status).toBe(404);
    expect(await testPrisma.follow.count()).toBe(0);
  });

  it('returns 404 when unfollowing an unknown user id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await unfollow('no-such-user-id')).status).toBe(404);
  });

  it('returns 400 for an empty id segment rather than a 500', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await follow('')).status).toBe(400);
  });
});
