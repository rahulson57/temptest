import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { testPrisma } from '@tests/helpers/db';
import { makeTag, makeUser } from '@tests/helpers/factories';
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

const { POST, DELETE } = await import('@/app/api/social/follow-tag/[tagId]/route');

type TagFollowState = { following: boolean; followerCount: number };

async function signIn(user: { id: string; email: string; handle: string }) {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

async function followTag(tagId: string) {
  return callRoute<TagFollowState>(
    POST,
    await buildRequest(`/api/social/follow-tag/${tagId}`, { method: 'POST' }),
    routeContext({ tagId }),
  );
}

async function unfollowTag(tagId: string) {
  return callRoute<TagFollowState>(
    DELETE,
    await buildRequest(`/api/social/follow-tag/${tagId}`, { method: 'DELETE' }),
    routeContext({ tagId }),
  );
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST/DELETE /api/social/follow-tag/[tagId]', () => {
  it('follows a topic', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const tag = await makeTag({ name: 'Design' });
    await signIn(viewer);

    const result = await followTag(tag.id);

    expect(result.status).toBe(200);
    expect(expectOk(result)).toEqual({ following: true, followerCount: 1 });
    expect(await testPrisma.tagFollow.count()).toBe(1);
  });

  it('is idempotent: following twice leaves exactly one row', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const tag = await makeTag({ name: 'Design' });
    await signIn(viewer);

    const first = await followTag(tag.id);
    const second = await followTag(tag.id);

    expect(expectOk(second)).toEqual(expectOk(first));
    expect(await testPrisma.tagFollow.count()).toBe(1);
  });

  it('is idempotent: unfollowing twice succeeds and leaves no row', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const tag = await makeTag({ name: 'Design' });
    await signIn(viewer);
    await followTag(tag.id);
    expect(await testPrisma.tagFollow.count()).toBe(1); // precondition

    const first = await unfollowTag(tag.id);
    const second = await unfollowTag(tag.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(expectOk(second)).toEqual({ following: false, followerCount: 0 });
    expect(await testPrisma.tagFollow.count()).toBe(0);
  });

  it('tracks each topic separately', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const design = await makeTag({ name: 'Design' });
    const climate = await makeTag({ name: 'Climate' });
    await signIn(viewer);

    await followTag(design.id);
    const result = await followTag(climate.id);

    expect(expectOk(result)).toEqual({ following: true, followerCount: 1 });
    expect(await testPrisma.tagFollow.count()).toBe(2);
  });

  it('counts followers across users', async () => {
    const tag = await makeTag({ name: 'Design' });
    const one = await makeUser({ handle: 'one' });
    const two = await makeUser({ handle: 'two' });

    await signIn(one);
    await followTag(tag.id);
    await signIn(two);

    expect(expectOk(await followTag(tag.id))).toEqual({ following: true, followerCount: 2 });
  });

  it('rejects a signed-out follow with 401 and writes nothing', async () => {
    const tag = await makeTag({ name: 'Design' });

    expect((await followTag(tag.id)).status).toBe(401);
    expect(await testPrisma.tagFollow.count()).toBe(0);
  });

  it('rejects a signed-out unfollow with 401', async () => {
    const tag = await makeTag({ name: 'Design' });

    expect((await unfollowTag(tag.id)).status).toBe(401);
  });

  it('returns 404 for an unknown tag id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await followTag('no-such-tag')).status).toBe(404);
    expect(await testPrisma.tagFollow.count()).toBe(0);
  });

  it('returns 404 when unfollowing an unknown tag id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await unfollowTag('no-such-tag')).status).toBe(404);
  });

  it('returns 400 for an empty tag id segment', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await followTag('')).status).toBe(400);
  });
});
