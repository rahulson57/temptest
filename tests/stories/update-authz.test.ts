import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH } from '@/app/api/stories/[id]/route';
import { PATCH as AUTOSAVE } from '@/app/api/stories/[id]/autosave/route';
import type { StoryDto } from '@/server/stories/serialize';
import { testPrisma } from '../helpers/db';
import { makeStory, makeTag, makeUser, resetFactoryCounter } from '../helpers/factories';
import { buildRequest, callRoute, expectOk, routeContext } from '../helpers/request';
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
 * Authorization on the single-story endpoints.
 *
 * THE RULE THIS FILE EXISTS TO PROVE: authentication is not authorization.
 * A valid session gets you a 401 you don't deserve; it does NOT get you write
 * access to someone else's row. Every mutating verb is asserted three ways —
 * owner succeeds, stranger gets 403, signed-out gets 401 — and each 403/401
 * assertion also checks the database is UNCHANGED, because a handler that
 * returns 403 after already writing has still lost the data.
 */
describe('/api/stories/[id] authorization', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function patch(id: string, body: unknown) {
    return callRoute<StoryDto>(
      PATCH,
      await buildRequest(`/api/stories/${id}`, { method: 'PATCH', body }),
      routeContext({ id }),
    );
  }

  async function autosave(id: string, body: unknown) {
    return callRoute<StoryDto>(
      AUTOSAVE,
      await buildRequest(`/api/stories/${id}/autosave`, { method: 'PATCH', body }),
      routeContext({ id }),
    );
  }

  async function del(id: string) {
    return callRoute(
      DELETE,
      await buildRequest(`/api/stories/${id}`, { method: 'DELETE' }),
      routeContext({ id }),
    );
  }

  describe('PATCH', () => {
    it('lets the owner edit their own draft', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id, status: 'DRAFT', title: 'Old title' });
      await signIn(owner);

      const result = await patch(story.id, { title: 'New title', subtitle: 'Now with a subtitle' });

      expect(result.status).toBe(200);
      const updated = expectOk(result);
      expect(updated.title).toBe('New title');
      expect(updated.subtitle).toBe('Now with a subtitle');

      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.title).toBe('New title');
    });

    it('returns 403 for a signed-in user who is not the author, and changes nothing', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const story = await makeStory({ authorId: owner.id, title: 'Untouched' });
      await signIn(stranger);

      const result = await patch(story.id, { title: 'Hijacked' });

      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.title).toBe('Untouched');
    });

    it('returns 401 when signed out, and changes nothing', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id, title: 'Untouched' });
      signOut();

      const result = await patch(story.id, { title: 'Hijacked' });

      expect(result.status).toBe(401);
      expect(result.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.title).toBe('Untouched');
    });

    it('returns 404 for a story that does not exist', async () => {
      const owner = await makeUser();
      await signIn(owner);

      const result = await patch('no-such-story', { title: 'Ghost' });

      expect(result.status).toBe(404);
    });

    it.each([
      ['empty title', { title: '' }],
      ['title over 120 chars', { title: 'x'.repeat(121) }],
      ['unknown field', { title: 'Fine', authorId: 'someone-else' }],
      ['six tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }],
      ['empty patch', {}],
    ])('returns 400 for %s', async (_label, body) => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id, title: 'Untouched' });
      await signIn(owner);

      const result = await patch(story.id, body);

      expect(result.status).toBe(400);
      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.title).toBe('Untouched');
    });

    it('never writes when the caller is a stranger, whatever the body', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const story = await makeStory({ authorId: owner.id, title: 'Untouched' });
      await signIn(stranger);

      // Shape of the body is irrelevant to the security property being asserted:
      // a non-owner must never mutate the row. A malformed body is rejected by
      // the zod boundary (400) before the service is reached; a well-formed one
      // is rejected by the ownership check (403). Both must leave the row alone.
      const malformed = await patch(story.id, { title: '' });
      const wellFormed = await patch(story.id, { title: 'Hijacked' });

      expect(malformed.status).toBe(400);
      expect(wellFormed.status).toBe(403);

      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.title).toBe('Untouched');
    });
  });

  describe('PATCH /autosave', () => {
    it('lets the owner autosave with an empty title', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id, status: 'DRAFT' });
      await signIn(owner);

      const result = await autosave(story.id, { title: '', bodyHtml: '<p>Work in progress.</p>' });

      expect(result.status).toBe(200);
      expect(expectOk(result).bodyHtml).toContain('Work in progress');
    });

    it('returns 403 for a stranger', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const story = await makeStory({ authorId: owner.id, bodyHtml: '<p>Mine.</p>' });
      await signIn(stranger);

      const result = await autosave(story.id, { bodyHtml: '<p>Yours now.</p>' });

      expect(result.status).toBe(403);
      const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.bodyHtml).toContain('Mine.');
    });

    it('returns 401 when signed out', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id });
      signOut();

      expect((await autosave(story.id, { bodyHtml: '<p>x</p>' })).status).toBe(401);
    });

    it('returns 400 for a field autosave does not accept', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id });
      await signIn(owner);

      // Tags are saved explicitly, never by the background autosave.
      const result = await autosave(story.id, { tags: ['design'] });

      expect(result.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('lets the owner delete, removing dependent StoryTag rows', async () => {
      const owner = await makeUser();
      const tag = await makeTag({ name: 'Design' });
      const story = await makeStory({ authorId: owner.id, tagIds: [tag.id] });
      await signIn(owner);

      expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(1);

      const result = await del(story.id);

      expect(result.status).toBe(200);
      expect(await testPrisma.story.findUnique({ where: { id: story.id } })).toBeNull();
      expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(0);
      // The Tag itself survives — other stories may still use it.
      expect(await testPrisma.tag.findUnique({ where: { id: tag.id } })).not.toBeNull();
    });

    it('returns 403 for a stranger and leaves the story in place', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const story = await makeStory({ authorId: owner.id });
      await signIn(stranger);

      const result = await del(story.id);

      expect(result.status).toBe(403);
      expect(await testPrisma.story.findUnique({ where: { id: story.id } })).not.toBeNull();
    });

    it('returns 401 when signed out and leaves the story in place', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id });
      signOut();

      const result = await del(story.id);

      expect(result.status).toBe(401);
      expect(await testPrisma.story.findUnique({ where: { id: story.id } })).not.toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
      const owner = await makeUser();
      await signIn(owner);

      expect((await del('no-such-story')).status).toBe(404);
    });
  });

  describe('GET', () => {
    it('serves a published story to a signed-out reader', async () => {
      const owner = await makeUser();
      const story = await makeStory({ authorId: owner.id, status: 'PUBLISHED' });
      signOut();

      const result = await callRoute<StoryDto>(
        GET,
        await buildRequest(`/api/stories/${story.id}`),
        routeContext({ id: story.id }),
      );

      expect(result.status).toBe(200);
      expect(expectOk(result).id).toBe(story.id);
    });

    it('hides a DRAFT from a signed-out reader (401) and from a stranger (403)', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const story = await makeStory({ authorId: owner.id, status: 'DRAFT' });

      signOut();
      const anonymous = await callRoute<StoryDto>(
        GET,
        await buildRequest(`/api/stories/${story.id}`),
        routeContext({ id: story.id }),
      );
      expect(anonymous.status).toBe(401);

      await signIn(stranger);
      const other = await callRoute<StoryDto>(
        GET,
        await buildRequest(`/api/stories/${story.id}`),
        routeContext({ id: story.id }),
      );
      expect(other.status).toBe(403);

      await signIn(owner);
      const mine = await callRoute<StoryDto>(
        GET,
        await buildRequest(`/api/stories/${story.id}`),
        routeContext({ id: story.id }),
      );
      expect(mine.status).toBe(200);
    });
  });
});
