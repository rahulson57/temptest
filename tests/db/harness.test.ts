import { describe, expect, it } from 'vitest';
import { tableCounts, testPrisma } from '@tests/helpers/db';
import {
  KNOWN_PASSWORD,
  KNOWN_PASSWORD_HASH,
  makeComment,
  makeStory,
  makeTag,
  makeUser,
} from '@tests/helpers/factories';
import { authHeaders, expiredSessionCookieFor, sessionTokenFor } from '@tests/helpers/auth';
import { buildRequest, createCookieStoreMock, routeContext } from '@tests/helpers/request';
import { verifyPassword } from '@/lib/auth/password';
import { verifySessionToken } from '@/lib/auth/session-token';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';

/**
 * Smoke tests for the test harness itself.
 *
 * If these fail, no other suite's result can be trusted — the DB lifecycle,
 * factories or auth helpers are broken rather than the code under test.
 */

describe('database lifecycle', () => {
  it('starts every test with an empty database', async () => {
    const counts = await tableCounts();
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('really writes rows (this test leaves data behind on purpose)', async () => {
    await makeUser();
    await makeStory();
    expect((await tableCounts()).users).toBeGreaterThan(0);
  });

  it('was truncated again before this test ran', async () => {
    // Proves the previous test's rows did not survive — test isolation holds.
    expect(await testPrisma.user.count()).toBe(0);
    expect(await testPrisma.story.count()).toBe(0);
  });
});

describe('factories', () => {
  it('creates a user with deterministic, unique fields', async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
    expect(a.handle).not.toBe(b.handle);
    expect(a.passwordHash).not.toContain(KNOWN_PASSWORD);
  });

  it('honours overrides', async () => {
    const user = await makeUser({ handle: 'ada', displayName: 'Ada W', email: 'ada@example.com' });
    expect(user.handle).toBe('ada');
    expect(user.displayName).toBe('Ada W');
    expect(user.email).toBe('ada@example.com');
  });

  it('KNOWN_PASSWORD_HASH is a real hash of KNOWN_PASSWORD', async () => {
    // Guards against the fixture hash rotting into a value nothing verifies.
    await expect(verifyPassword(KNOWN_PASSWORD, KNOWN_PASSWORD_HASH)).resolves.toBe(true);
    const user = await makeUser();
    await expect(verifyPassword(KNOWN_PASSWORD, user.passwordHash)).resolves.toBe(true);
  });

  it('creates a published story with a computed reading time and sanitized body', async () => {
    const story = await makeStory({ bodyHtml: '<p>hello</p><script>alert(1)</script>' });
    expect(story.status).toBe('PUBLISHED');
    expect(story.publishedAt).not.toBeNull();
    expect(story.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(story.bodyHtml).not.toContain('script');
  });

  it('creates a draft with no publishedAt', async () => {
    const story = await makeStory({ status: 'DRAFT' });
    expect(story.status).toBe('DRAFT');
    expect(story.publishedAt).toBeNull();
  });

  it('attaches tags through the join table', async () => {
    const tag = await makeTag({ name: 'Design' });
    const story = await makeStory({ tagIds: [tag.id] });
    const links = await testPrisma.storyTag.findMany({ where: { storyId: story.id } });
    expect(links).toHaveLength(1);
    expect(links[0]?.tagId).toBe(tag.id);
  });

  it('creates threaded comments', async () => {
    const story = await makeStory();
    const parent = await makeComment({ storyId: story.id });
    const reply = await makeComment({ storyId: story.id, parentId: parent.id });
    expect(reply.parentId).toBe(parent.id);

    const replies = await testPrisma.comment.findMany({ where: { parentId: parent.id } });
    expect(replies).toHaveLength(1);
  });

  it('cascades deletes from story to its comments and tags', async () => {
    const tag = await makeTag();
    const story = await makeStory({ tagIds: [tag.id] });
    await makeComment({ storyId: story.id });

    await testPrisma.story.delete({ where: { id: story.id } });

    expect(await testPrisma.comment.count()).toBe(0);
    expect(await testPrisma.storyTag.count()).toBe(0);
    // The tag itself survives — only the link is removed.
    expect(await testPrisma.tag.count()).toBe(1);
  });
});

describe('auth helpers', () => {
  it('signs a token that the real verifier accepts', async () => {
    const user = await makeUser({ handle: 'ada', email: 'ada@example.com' });
    const token = await sessionTokenFor(user);
    await expect(verifySessionToken(token)).resolves.toEqual({
      sub: user.id,
      email: user.email,
      handle: user.handle,
    });
  });

  it('builds a cookie header the middleware can read', async () => {
    const user = await makeUser();
    const headers = await authHeaders(user);
    const cookie = headers.get('cookie') ?? '';
    expect(cookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
  });

  it('can mint an already-expired cookie', async () => {
    const user = await makeUser();
    const cookie = await expiredSessionCookieFor(user);
    const token = cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});

describe('request helpers', () => {
  it('builds a GET request with query params', async () => {
    const request = await buildRequest('/api/stories', { query: { limit: 5, cursor: 'abc' } });
    expect(request.method).toBe('GET');
    expect(request.nextUrl.searchParams.get('limit')).toBe('5');
    expect(request.nextUrl.searchParams.get('cursor')).toBe('abc');
  });

  it('builds a JSON POST and attaches the session cookie for a user', async () => {
    const user = await makeUser();
    const request = await buildRequest('/api/stories', { body: { title: 'Hi' }, user });
    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('cookie')).toContain(`${SESSION_COOKIE_NAME}=`);
    await expect(request.json()).resolves.toEqual({ title: 'Hi' });
  });

  it('exposes Next 15 style async route params', async () => {
    const context = routeContext({ slug: 'hello-world' });
    await expect(context.params).resolves.toEqual({ slug: 'hello-world' });
  });

  it('provides a working cookie-store double', () => {
    const store = createCookieStoreMock({ session: 'abc' });
    expect(store.get('session')).toEqual({ name: 'session', value: 'abc' });
    store.set('session', 'def');
    expect(store.get('session')?.value).toBe('def');
    store.delete('session');
    expect(store.get('session')).toBeUndefined();
    expect(store.has('session')).toBe(false);
  });
});
