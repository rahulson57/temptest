import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stories/route';
import { buildRequest, callRoute, expectOk } from '../helpers/request';
import { makeUser, resetFactoryCounter } from '../helpers/factories';
import { testPrisma } from '../helpers/db';
import { signIn, signOut, cookieStore } from './helpers';
import type { StoryDto } from '@/server/stories/serialize';

vi.mock('next/headers', async () => {
  const { cookieStore: jar } = await import('./helpers');
  return { cookies: async () => jar };
});
vi.mock('@/lib/db', async () => {
  const { testPrisma: db } = await import('../helpers/db');
  return { prisma: db, default: db };
});

/**
 * POST /api/stories — create a draft.
 *
 * Covers the three paths every mutation owes: happy, unauthorized, invalid.
 */
describe('POST /api/stories', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function post(body: unknown) {
    return callRoute<StoryDto>(POST, await buildRequest('/api/stories', { method: 'POST', body }));
  }

  it('creates a DRAFT owned by the signed-in user', async () => {
    const author = await makeUser();
    await signIn(author);

    const result = await post({
      title: 'Hello World',
      subtitle: 'A first post',
      bodyHtml: '<p>Some body text that is long enough to matter.</p>',
      tags: ['Design', 'writing'],
    });

    expect(result.status).toBe(201);
    const story = expectOk(result);
    expect(story.status).toBe('DRAFT');
    expect(story.publishedAt).toBeNull();
    expect(story.slug).toBe('hello-world');
    expect(story.title).toBe('Hello World');
    expect(story.subtitle).toBe('A first post');
    // Derived server-side, never client-supplied.
    expect(story.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(story.tags.map((tag) => tag.slug).sort()).toEqual(['design', 'writing']);

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted).not.toBeNull();
    expect(persisted?.authorId).toBe(author.id);
    expect(persisted?.status).toBe('DRAFT');
  });

  it('defaults an empty body and no tags rather than failing', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(await post({ title: 'Just a title' }));
    expect(story.bodyHtml).toBe('');
    expect(story.tags).toEqual([]);
    expect(story.readingTimeMinutes).toBe(1);
  });

  it('ignores a client-supplied authorId — the session decides ownership', async () => {
    const author = await makeUser();
    const victim = await makeUser();
    await signIn(author);

    // `.strict()` rejects the attempt outright rather than silently dropping it.
    const result = await post({ title: 'Mass assignment', authorId: victim.id });
    expect(result.status).toBe(400);

    const stories = await testPrisma.story.findMany({ where: { authorId: victim.id } });
    expect(stories).toHaveLength(0);
  });

  it('returns 401 when signed out', async () => {
    signOut();

    const result = await post({ title: 'Anonymous draft' });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(await testPrisma.story.count()).toBe(0);
  });

  it('returns 401 for an expired session rather than trusting the cookie', async () => {
    const author = await makeUser();
    const { sessionTokenFor } = await import('../helpers/auth');
    const { SESSION_COOKIE_NAME } = await import('@/lib/auth/session-token');
    cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(author, -60));

    const result = await post({ title: 'Stale session' });

    expect(result.status).toBe(401);
    expect(await testPrisma.story.count()).toBe(0);
  });

  it.each([
    ['missing title', {}],
    ['empty title', { title: '   ' }],
    ['title over 120 chars', { title: 'x'.repeat(121) }],
    ['subtitle over 200 chars', { title: 'Fine', subtitle: 'y'.repeat(201) }],
    ['non-string title', { title: 42 }],
    ['tags not an array', { title: 'Fine', tags: 'design' }],
    ['unknown field', { title: 'Fine', status: 'PUBLISHED' }],
  ])('returns 400 for %s', async (_label, body) => {
    const author = await makeUser();
    await signIn(author);

    const result = await post(body);

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false });
    expect(await testPrisma.story.count()).toBe(0);
  });

  it('returns 400 for a body that is not JSON at all', async () => {
    const author = await makeUser();
    await signIn(author);

    const request = await buildRequest('/api/stories', { method: 'POST' });
    const result = await callRoute(POST, request);

    expect(result.status).toBe(400);
  });

  it('cannot be published straight from create — status is not client-settable', async () => {
    const author = await makeUser();
    await signIn(author);

    const result = await post({ title: 'Sneaky', status: 'PUBLISHED', publishedAt: new Date(0) });

    expect(result.status).toBe(400);
    expect(await testPrisma.story.count({ where: { status: 'PUBLISHED' } })).toBe(0);
  });
});
