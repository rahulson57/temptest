import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stories/route';
import { PATCH } from '@/app/api/stories/[id]/route';
import type { StoryDto } from '@/server/stories/serialize';
import { MAX_TAGS_PER_STORY } from '@/lib/types';
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
 * The five-tag cap and idempotent tag attachment.
 *
 * Two separate properties are at stake and they fail differently:
 *  - THE CAP is a validation rule; the sixth tag must be a 400, not a silently
 *    dropped tag, because silently dropping input is how a user loses work
 *    without ever being told.
 *  - IDEMPOTENCE is a data-layer rule; "design" must be ONE Tag row no matter
 *    how many authors use it and how many times a story is saved, or tag pages
 *    fragment into near-duplicates.
 */
describe('story tags', () => {
  beforeEach(() => {
    resetFactoryCounter();
    cookieStore.clear();
  });

  async function create(body: unknown) {
    return callRoute<StoryDto>(
      POST,
      await buildRequest('/api/stories', { method: 'POST', body }),
    );
  }

  async function patch(id: string, body: unknown) {
    return callRoute<StoryDto>(
      PATCH,
      await buildRequest(`/api/stories/${id}`, { method: 'PATCH', body }),
      routeContext({ id }),
    );
  }

  it('accepts exactly five tags', async () => {
    const author = await makeUser();
    await signIn(author);

    const tags = ['design', 'writing', 'code', 'craft', 'tools'];
    expect(tags).toHaveLength(MAX_TAGS_PER_STORY);

    const result = await create({ title: 'Five tags', tags });

    expect(result.status).toBe(201);
    const story = expectOk(result);
    expect(story.tags).toHaveLength(5);
    expect(story.tags.map((tag) => tag.slug).sort()).toEqual([...tags].sort());
    expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(5);
  });

  it('rejects the sixth tag with 400 and stores nothing', async () => {
    const author = await makeUser();
    await signIn(author);

    const result = await create({
      title: 'Six tags',
      tags: ['design', 'writing', 'code', 'craft', 'tools', 'extra'],
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false });
    // The whole create is refused — not a five-tag story with the sixth dropped.
    expect(await testPrisma.story.count()).toBe(0);
    expect(await testPrisma.tag.count()).toBe(0);
  });

  it('rejects a sixth tag added later by PATCH', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(
      await create({ title: 'Growing tags', tags: ['a', 'b', 'c', 'd', 'e'] }),
    );

    const result = await patch(story.id, { tags: ['a', 'b', 'c', 'd', 'e', 'f'] });

    expect(result.status).toBe(400);
    const rows = await testPrisma.storyTag.findMany({ where: { storyId: story.id } });
    expect(rows).toHaveLength(5);
  });

  it('rejects an empty or over-long tag name with 400', async () => {
    const author = await makeUser();
    await signIn(author);

    expect((await create({ title: 'Bad tag', tags: [''] })).status).toBe(400);
    expect((await create({ title: 'Bad tag', tags: ['x'.repeat(31)] })).status).toBe(400);
    expect(await testPrisma.story.count()).toBe(0);
  });

  it('creates each tag once and shares it across stories and authors', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    await signIn(alice);
    const hers = expectOk(await create({ title: 'Hers', tags: ['Design', 'writing'] }));

    await signIn(bob);
    const his = expectOk(await create({ title: 'His', tags: ['design', 'DESIGN', 'tools'] }));

    const design = await testPrisma.tag.findMany({ where: { slug: 'design' } });
    expect(design).toHaveLength(1);

    // Case folding means "Design", "design" and "DESIGN" are one tag — and the
    // duplicate inside a single request collapses instead of double-attaching.
    expect(hers.tags.map((tag) => tag.slug).sort()).toEqual(['design', 'writing']);
    expect(his.tags.map((tag) => tag.slug).sort()).toEqual(['design', 'tools']);

    expect(await testPrisma.storyTag.count({ where: { tagId: design[0]!.id } })).toBe(2);
  });

  it('is idempotent: saving the same tags twice leaves the same rows', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(await create({ title: 'Same tags', tags: ['design', 'writing'] }));

    const before = await testPrisma.storyTag.findMany({
      where: { storyId: story.id },
      orderBy: { tagId: 'asc' },
    });
    expect(before).toHaveLength(2);

    await patch(story.id, { tags: ['design', 'writing'] });
    await patch(story.id, { tags: ['design', 'writing'] });

    const after = await testPrisma.storyTag.findMany({
      where: { storyId: story.id },
      orderBy: { tagId: 'asc' },
    });
    expect(after).toEqual(before);
    expect(await testPrisma.tag.count()).toBe(2);
  });

  it('replaces the tag set on update and detaches what was removed', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(await create({ title: 'Retagged', tags: ['design', 'writing'] }));

    const updated = expectOk(await patch(story.id, { tags: ['code'] }));

    expect(updated.tags.map((tag) => tag.slug)).toEqual(['code']);
    expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(1);
    // The orphaned Tag row survives — another story may still reference it.
    expect(await testPrisma.tag.findUnique({ where: { slug: 'design' } })).not.toBeNull();
  });

  it('clears every tag when an empty list is saved', async () => {
    const author = await makeUser();
    await signIn(author);

    const story = expectOk(await create({ title: 'Untagged soon', tags: ['design'] }));
    expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(1);

    const updated = expectOk(await patch(story.id, { tags: [] }));

    expect(updated.tags).toEqual([]);
    expect(await testPrisma.storyTag.count({ where: { storyId: story.id } })).toBe(0);
  });
});
