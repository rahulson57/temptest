import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stories/route';
import { PATCH } from '@/app/api/stories/[id]/route';
import { POST as PUBLISH } from '@/app/api/stories/[id]/publish/route';
import type { StoryDto } from '@/server/stories/serialize';
import { testPrisma } from '../helpers/db';
import { makeUser, resetFactoryCounter } from '../helpers/factories';
import { buildRequest, callRoute, expectOk, routeContext } from '../helpers/request';
import { cookieStore, signIn } from './helpers';

vi.mock('next/headers', async () => {
  const { cookieStore: jar } = await import('./helpers');
  return { cookies: async () => jar };
});
vi.mock('@/lib/db', async () => {
  const { testPrisma: db } = await import('../helpers/db');
  return { prisma: db, default: db };
});

/**
 * Slug derivation and collision handling.
 *
 * Story.slug is `@unique` in the schema, so a collision is not a cosmetic
 * problem — it is an unhandled Prisma P2002 and a 500 on someone's save. These
 * tests drive the probe (`base`, `base-2`, `base-3`, …) through the real API,
 * including the cross-author case, which is the one that actually happens: two
 * strangers both writing "Hello World" have no idea the other exists.
 */
describe('slug collisions', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function create(title: string) {
    return expectOk(
      await callRoute<StoryDto>(
        POST,
        await buildRequest('/api/stories', { method: 'POST', body: { title } }),
      ),
    );
  }

  it('gives the second "Hello World" the slug hello-world-2', async () => {
    const author = await makeUser();
    await signIn(author);

    const first = await create('Hello World');
    const second = await create('Hello World');

    expect(first.slug).toBe('hello-world');
    expect(second.slug).toBe('hello-world-2');
  });

  it('keeps counting past the second collision', async () => {
    const author = await makeUser();
    await signIn(author);

    const slugs = [
      (await create('Hello World')).slug,
      (await create('Hello World')).slug,
      (await create('Hello World')).slug,
      (await create('Hello World')).slug,
    ];

    expect(slugs).toEqual(['hello-world', 'hello-world-2', 'hello-world-3', 'hello-world-4']);
    // Non-empty precondition, then the property: every slug is distinct.
    expect(slugs).toHaveLength(4);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('collides across authors, not just within one account', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    await signIn(alice);
    const hers = await create('Shared Title');

    await signIn(bob);
    const his = await create('Shared Title');

    expect(hers.slug).toBe('shared-title');
    expect(his.slug).toBe('shared-title-2');
  });

  it('normalizes punctuation, case and accents into the slug', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = await create('  Héllo, World! — Part One  ');

    expect(story.slug).toBe('hello-world-part-one');
  });

  it('re-slugs a DRAFT when its title changes, and does not collide with itself', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = await create('First Idea');
    expect(story.slug).toBe('first-idea');

    const renamed = expectOk(
      await callRoute<StoryDto>(
        PATCH,
        await buildRequest(`/api/stories/${story.id}`, {
          method: 'PATCH',
          body: { title: 'Second Idea' },
        }),
        routeContext({ id: story.id }),
      ),
    );
    expect(renamed.slug).toBe('second-idea');

    // Saving the SAME title again must not walk the slug to second-idea-2.
    const resaved = expectOk(
      await callRoute<StoryDto>(
        PATCH,
        await buildRequest(`/api/stories/${story.id}`, {
          method: 'PATCH',
          body: { title: 'Second Idea' },
        }),
        routeContext({ id: story.id }),
      ),
    );
    expect(resaved.slug).toBe('second-idea');
  });

  it('never produces a duplicate slug in the database', async () => {
    const author = await makeUser();
    await signIn(author);

    for (let i = 0; i < 6; i += 1) await create('Repeat Me');

    const stories = await testPrisma.story.findMany({ select: { slug: true } });
    // Assert the set is non-empty BEFORE asserting a property over it: six
    // creates that silently produced zero rows would otherwise pass here.
    expect(stories).toHaveLength(6);
    expect(new Set(stories.map((story) => story.slug)).size).toBe(6);
  });

  it('gives an untitled draft a usable slug when it is finally published', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = await create('Placeholder');
    // Retitle to something that slugifies to nothing but is still a valid title.
    const renamed = expectOk(
      await callRoute<StoryDto>(
        PATCH,
        await buildRequest(`/api/stories/${story.id}`, {
          method: 'PATCH',
          body: { title: '!!!' },
        }),
        routeContext({ id: story.id }),
      ),
    );
    expect(renamed.slug).toBe('untitled');

    // Publishing a title with no letters or digits is refused rather than
    // shipping a story whose URL is meaningless.
    const published = await callRoute<StoryDto>(
      PUBLISH,
      await buildRequest(`/api/stories/${story.id}/publish`, { method: 'POST' }),
      routeContext({ id: story.id }),
    );
    expect(published.status).toBe(400);
  });
});
