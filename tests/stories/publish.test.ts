import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as PUBLISH } from '@/app/api/stories/[id]/publish/route';
import { POST as UNPUBLISH } from '@/app/api/stories/[id]/unpublish/route';
import type { StoryDto } from '@/server/stories/serialize';
import { testPrisma } from '../helpers/db';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
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
 * Publish / unpublish.
 *
 * The load-bearing assertion in this file is IDEMPOTENCE: publishing twice must
 * not move `publishedAt`. If it did, every edit-and-republish would relabel an
 * old story as new, reorder it to the top of every feed sorted by publishedAt,
 * and make "published 3 days ago" a lie.
 */
describe('POST /api/stories/[id]/publish', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function publish(id: string) {
    return callRoute<StoryDto>(
      PUBLISH,
      await buildRequest(`/api/stories/${id}/publish`, { method: 'POST' }),
      routeContext({ id }),
    );
  }

  async function unpublish(id: string) {
    return callRoute<StoryDto>(
      UNPUBLISH,
      await buildRequest(`/api/stories/${id}/unpublish`, { method: 'POST' }),
      routeContext({ id }),
    );
  }

  it('sets status=PUBLISHED and stamps publishedAt', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT', title: 'Ship it' });
    await signIn(owner);

    expect(story.publishedAt).toBeNull();

    const result = await publish(story.id);

    expect(result.status).toBe(200);
    const published = expectOk(result);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('PUBLISHED');
    expect(persisted?.publishedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: re-publishing does not move publishedAt', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT', title: 'Ship it twice' });
    await signIn(owner);

    const first = expectOk(await publish(story.id));
    expect(first.publishedAt).not.toBeNull();

    const second = expectOk(await publish(story.id));
    const third = expectOk(await publish(story.id));

    expect(second.publishedAt).toBe(first.publishedAt);
    expect(third.publishedAt).toBe(first.publishedAt);
    expect(second.status).toBe('PUBLISHED');
  });

  it('keeps publishedAt across an unpublish/republish cycle', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT', title: 'Round trip' });
    await signIn(owner);

    const first = expectOk(await publish(story.id));

    const drafted = expectOk(await unpublish(story.id));
    expect(drafted.status).toBe('DRAFT');
    // Unpublishing records nothing new; it only hides the story.
    expect(drafted.publishedAt).toBe(first.publishedAt);

    const republished = expectOk(await publish(story.id));
    expect(republished.status).toBe('PUBLISHED');
    expect(republished.publishedAt).toBe(first.publishedAt);
  });

  it('freezes the slug once published', async () => {
    const owner = await makeUser();
    const story = await makeStory({
      authorId: owner.id,
      status: 'DRAFT',
      title: 'Original title',
      slug: 'original-title',
    });
    await signIn(owner);

    const published = expectOk(await publish(story.id));
    expect(published.slug).toBe('original-title');

    const { PATCH } = await import('@/app/api/stories/[id]/route');
    const renamed = expectOk(
      await callRoute<StoryDto>(
        PATCH,
        await buildRequest(`/api/stories/${story.id}`, {
          method: 'PATCH',
          body: { title: 'Completely different title' },
        }),
        routeContext({ id: story.id }),
      ),
    );

    // A published URL that moves is a broken link in somebody's bookmark.
    expect(renamed.title).toBe('Completely different title');
    expect(renamed.slug).toBe('original-title');
  });

  it('refuses to publish a story with no usable title (400)', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT', title: '   ' });
    await signIn(owner);

    const result = await publish(story.id);

    expect(result.status).toBe(400);
    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.publishedAt).toBeNull();
  });

  it('returns 403 for a stranger and leaves the story a draft', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT' });
    await signIn(stranger);

    expect((await publish(story.id)).status).toBe(403);

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.publishedAt).toBeNull();
  });

  it('returns 401 when signed out and leaves the story a draft', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT' });
    signOut();

    expect((await publish(story.id)).status).toBe(401);

    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('DRAFT');
  });

  it('returns 404 for an unknown id', async () => {
    const owner = await makeUser();
    await signIn(owner);

    expect((await publish('no-such-story')).status).toBe(404);
  });
});

describe('POST /api/stories/[id]/unpublish', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function unpublish(id: string) {
    return callRoute<StoryDto>(
      UNPUBLISH,
      await buildRequest(`/api/stories/${id}/unpublish`, { method: 'POST' }),
      routeContext({ id }),
    );
  }

  it('returns a published story to DRAFT', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'PUBLISHED' });
    await signIn(owner);

    const result = await unpublish(story.id);

    expect(result.status).toBe(200);
    expect(expectOk(result).status).toBe('DRAFT');
    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('DRAFT');
  });

  it('is idempotent on a story that is already a draft', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'DRAFT' });
    await signIn(owner);

    expect(expectOk(await unpublish(story.id)).status).toBe('DRAFT');
    expect(expectOk(await unpublish(story.id)).status).toBe('DRAFT');
  });

  it('returns 403 for a stranger and leaves the story published', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'PUBLISHED' });
    await signIn(stranger);

    expect((await unpublish(story.id)).status).toBe(403);
    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });

  it('returns 401 when signed out and leaves the story published', async () => {
    const owner = await makeUser();
    const story = await makeStory({ authorId: owner.id, status: 'PUBLISHED' });
    signOut();

    expect((await unpublish(story.id)).status).toBe(401);
    const persisted = await testPrisma.story.findUnique({ where: { id: story.id } });
    expect(persisted?.status).toBe('PUBLISHED');
  });
});
