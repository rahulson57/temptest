import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { MAX_CLAPS_PER_USER } from '@/lib/types';
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

/** See tests/auth/signup.test.ts for why both of these are doubled. */
const cookieStore = createCookieStoreMock();
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
vi.mock('@/lib/db', async () => {
  const { testPrisma } = await import('@tests/helpers/db');
  return { prisma: testPrisma, default: testPrisma };
});

const { POST } = await import('@/app/api/social/clap/[storyId]/route');

type ClapResponse = {
  storyTotal: number;
  userCount: number;
  maxPerUser: number;
  clamped: boolean;
};

async function signIn(user: { id: string; email: string; handle: string }) {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

async function clap(storyId: string, body?: unknown) {
  return callRoute<ClapResponse>(
    POST,
    await buildRequest(`/api/social/clap/${storyId}`, {
      method: 'POST',
      ...(body === undefined ? { headers: { 'content-type': 'application/json' } } : { body }),
    }),
    routeContext({ storyId }),
  );
}

beforeEach(() => {
  cookieStore.clear();
});

describe('POST /api/social/clap/[storyId] — accumulation', () => {
  it('records a first clap', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const result = await clap(story.id, { count: 1 });

    expect(result.status).toBe(200);
    expect(expectOk(result)).toMatchObject({ storyTotal: 1, userCount: 1, clamped: false });
  });

  it('ACCUMULATES across requests rather than toggling', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    await clap(story.id, { count: 3 });
    await clap(story.id, { count: 4 });
    const result = await clap(story.id, { count: 1 });

    expect(expectOk(result)).toMatchObject({ storyTotal: 8, userCount: 8 });
    const row = await testPrisma.clap.findUnique({
      where: { userId_storyId: { userId: viewer.id, storyId: story.id } },
    });
    expect(row?.count).toBe(8);
    // One row per (user, story) — the composite PK, not a row per clap.
    expect(await testPrisma.clap.count()).toBe(1);
  });

  it('defaults to a single clap when the body omits count', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const result = await clap(story.id, {});

    expect(result.status).toBe(200);
    expect(expectOk(result).userCount).toBe(1);
  });

  it('sums claps from different readers into the story total', async () => {
    const story = await makeStory();
    const one = await makeUser({ handle: 'one' });
    const two = await makeUser({ handle: 'two' });

    await signIn(one);
    await clap(story.id, { count: 5 });
    await signIn(two);
    const result = await clap(story.id, { count: 2 });

    // storyTotal is everyone's; userCount is only this reader's.
    expect(expectOk(result)).toMatchObject({ storyTotal: 7, userCount: 2 });
  });

  it('lets an author clap their own story', async () => {
    const author = await makeUser({ handle: 'author' });
    const story = await makeStory({ authorId: author.id });
    await signIn(author);

    const result = await clap(story.id, { count: 2 });

    expect(result.status).toBe(200);
    expect(expectOk(result).userCount).toBe(2);
  });
});

describe('POST /api/social/clap/[storyId] — the 50-clap ceiling clamps, never errors', () => {
  it('clamps a single over-cap request and still returns 200', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const result = await clap(story.id, { count: MAX_CLAPS_PER_USER + 500 });

    expect(result.status).toBe(200);
    expect(expectOk(result)).toMatchObject({
      userCount: MAX_CLAPS_PER_USER,
      storyTotal: MAX_CLAPS_PER_USER,
      maxPerUser: MAX_CLAPS_PER_USER,
      clamped: true,
    });
  });

  it('clamps accumulated claps that cross the ceiling', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    await clap(story.id, { count: MAX_CLAPS_PER_USER - 2 });
    const result = await clap(story.id, { count: 10 });

    expect(result.status).toBe(200);
    expect(expectOk(result).userCount).toBe(MAX_CLAPS_PER_USER);
    const row = await testPrisma.clap.findUnique({
      where: { userId_storyId: { userId: viewer.id, storyId: story.id } },
    });
    expect(row?.count).toBe(MAX_CLAPS_PER_USER);
  });

  it('stays at the ceiling when clapped again, without erroring', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);
    await clap(story.id, { count: MAX_CLAPS_PER_USER });

    const result = await clap(story.id, { count: 25 });

    expect(result.status).toBe(200);
    expect(expectOk(result).userCount).toBe(MAX_CLAPS_PER_USER);
  });

  it('caps PER USER, not per story — a second reader is unaffected', async () => {
    const story = await makeStory();
    const one = await makeUser({ handle: 'one' });
    const two = await makeUser({ handle: 'two' });

    await signIn(one);
    await clap(story.id, { count: MAX_CLAPS_PER_USER + 10 });
    await signIn(two);
    const result = await clap(story.id, { count: MAX_CLAPS_PER_USER + 10 });

    expect(expectOk(result)).toMatchObject({
      userCount: MAX_CLAPS_PER_USER,
      storyTotal: MAX_CLAPS_PER_USER * 2,
    });
  });
});

describe('POST /api/social/clap/[storyId] — rejections', () => {
  it('rejects a zero count with 400 and writes nothing', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    const result = await clap(story.id, { count: 0 });

    expect(result.status).toBe(400);
    expect(await testPrisma.clap.count()).toBe(0);
  });

  it('rejects a negative count with 400 and cannot decrement an existing total', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);
    await clap(story.id, { count: 10 });

    const result = await clap(story.id, { count: -5 });

    expect(result.status).toBe(400);
    const row = await testPrisma.clap.findUnique({
      where: { userId_storyId: { userId: viewer.id, storyId: story.id } },
    });
    expect(row?.count).toBe(10);
  });

  it('rejects a fractional count with 400', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    expect((await clap(story.id, { count: 1.5 })).status).toBe(400);
  });

  it('rejects a non-numeric count with 400', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    const story = await makeStory();
    await signIn(viewer);

    expect((await clap(story.id, { count: '10' })).status).toBe(400);
  });

  it('rejects a signed-out clap with 401 and writes nothing', async () => {
    const story = await makeStory();

    const result = await clap(story.id, { count: 1 });

    expect(result.status).toBe(401);
    expect(await testPrisma.clap.count()).toBe(0);
  });

  it('returns 404 for an unknown story id', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    const result = await clap('no-such-story', { count: 1 });

    expect(result.status).toBe(404);
    expect(await testPrisma.clap.count()).toBe(0);
  });

  it('returns 400 for an empty story id segment', async () => {
    const viewer = await makeUser({ handle: 'viewer' });
    await signIn(viewer);

    expect((await clap('', { count: 1 })).status).toBe(400);
  });
});
