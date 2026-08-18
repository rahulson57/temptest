import type { Prisma, StoryStatus } from '@prisma/client';
import { assertOwner } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import { pageParams, prismaPageArgs, toPage, type Page } from '@/lib/pagination';
import { readingTimeMinutes } from '@/lib/readingTime';
import { sanitizeStoryHtml } from '@/lib/sanitize';
import { slugify, slugifyWithFallback, uniqueSlug } from '@/lib/slug';
import { STORY_INCLUDE, toStoryDto, type StoryDto, type StoryWithTags } from './serialize';
import type {
  AutosaveStoryInput,
  CreateStoryInput,
  ListStoriesQuery,
  UpdateStoryInput,
} from './validation';

/**
 * Authoring business rules — the single place that knows what a story IS.
 *
 * Route handlers do transport (auth, validation, envelope); everything about
 * slugs, sanitization, reading time, tag attachment and publish state lives
 * here, so the same rules hold no matter which entry point calls them.
 *
 * FOUR INVARIANTS THIS MODULE ENFORCES
 *
 * 1. Stored HTML is always sanitized. `bodyHtml` is written through
 *    `sanitizeStoryHtml()` on EVERY path (create, update, autosave) — never
 *    "later, before render". A rendering bug then cannot resurrect a payload
 *    that was never stored.
 * 2. `readingTimeMinutes` is derived, never client-supplied.
 * 3. A slug is derived from the title and unique. It follows the title while a
 *    story is a DRAFT and FREEZES on publish, because a published URL that
 *    moves is a broken link in someone else's bookmark.
 * 4. `publishedAt` is set once. Re-publishing does not move it, so "published
 *    3 days ago" stays true across an edit-and-republish cycle.
 */

/** Anything with an id — what an ownership check needs from the viewer. */
export type Viewer = { id: string };

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

/**
 * Does `slug` already derive from `title`?
 *
 * True for the exact base and for a collision suffix of that base
 * ("hello-world", "hello-world-2"). Used to avoid re-slugging — and therefore
 * re-running the collision probe — on every autosave that did not change the
 * title, and to avoid gratuitously turning "hello-world-2" back into
 * "hello-world" when the title never moved.
 */
function slugMatchesTitle(slug: string, title: string): boolean {
  const base = slugifyWithFallback(title);
  if (slug === base) return true;
  const suffix = slug.startsWith(`${base}-`) ? slug.slice(base.length + 1) : null;
  return suffix !== null && /^\d+$/.test(suffix);
}

/**
 * A free slug for `title`, ignoring `excludeId` (the story being updated —
 * a story never collides with itself).
 */
async function nextFreeSlug(db: Db, title: string, excludeId?: string): Promise<string> {
  return uniqueSlug(title, async (candidate) => {
    const clash = await db.story.findFirst({
      where: excludeId ? { slug: candidate, NOT: { id: excludeId } } : { slug: candidate },
      select: { id: true },
    });
    return clash !== null;
  });
}

/* ------------------------------------------------------------------ *
 * Tags
 * ------------------------------------------------------------------ */

/**
 * Replace a story's tags with `names`, creating tags as needed.
 *
 * Idempotent in both directions: `upsert` on the unique slug means two authors
 * tagging "design" share one Tag row, and the delete-then-attach means saving
 * the same tag list twice leaves exactly the same StoryTag rows.
 */
async function syncStoryTags(db: Db, storyId: string, names: string[]): Promise<void> {
  const tagIds: string[] = [];
  for (const name of names) {
    const slug = slugifyWithFallback(name);
    const tag = await db.tag.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
      select: { id: true },
    });
    if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
  }

  await db.storyTag.deleteMany({ where: { storyId } });
  for (const tagId of tagIds) {
    await db.storyTag.create({ data: { storyId, tagId } });
  }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function findStoryOr404(db: Db, id: string): Promise<StoryWithTags> {
  const story = await db.story.findUnique({ where: { id }, include: STORY_INCLUDE });
  if (!story) throw new NotFoundError('That story does not exist');
  return story;
}

/**
 * Load a story the viewer is allowed to MUTATE.
 *
 * 404 before 403: a missing id and someone else's id are both "not yours", and
 * answering them differently would let anyone enumerate which story ids exist.
 * Ownership is re-checked here on every mutation — middleware protects pages,
 * not rows.
 */
async function loadOwnedStory(db: Db, id: string, viewer: Viewer): Promise<StoryWithTags> {
  const story = await findStoryOr404(db, id);
  assertOwner(story.authorId, viewer);
  return story;
}

/**
 * Read one story.
 *
 * Published stories are readable by anyone. A DRAFT is visible only to its
 * author: signed out is 401 (signing in might help), signed in as someone else
 * is 403 (it never will).
 */
export async function getStory(id: string, viewer: Viewer | null): Promise<StoryDto> {
  const story = await findStoryOr404(prisma, id);
  if (story.status === 'DRAFT') {
    if (!viewer) throw new UnauthorizedError('You must be signed in to view this draft');
    assertOwner(story.authorId, viewer);
  }
  return toStoryDto(story);
}

/** The signed-in author's own stories, newest first, cursor-paginated. */
export async function listOwnStories(
  viewer: Viewer,
  query: Pick<ListStoriesQuery, 'limit' | 'cursor' | 'status'>,
): Promise<Page<StoryDto>> {
  const params = pageParams(query);
  const where: Prisma.StoryWhereInput = { authorId: viewer.id };
  if (query.status) where.status = query.status;

  const rows = await prisma.story.findMany({
    where,
    // updatedAt first: this is a work-in-progress list, so "what I touched last"
    // is the useful order. `id` breaks ties so the cursor is total.
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: STORY_INCLUDE,
    ...prismaPageArgs(params),
  });

  const page = toPage(rows, params.limit);
  return { items: page.items.map(toStoryDto), nextCursor: page.nextCursor };
}

/** One page of the viewer's drafts — what /drafts renders. */
export async function listOwnDrafts(
  viewer: Viewer,
  query: { limit?: number | string | null; cursor?: string | null },
): Promise<Page<StoryDto>> {
  return listOwnStories(viewer, { ...pageParams(query), status: 'DRAFT' });
}

/**
 * Load a story for the editor, or null when it is missing or not the viewer's.
 *
 * The page uses this instead of `loadOwnedStory` so it can render a 404 for
 * both cases rather than throwing: a Forbidden thrown out of a server component
 * is an unhandled 500, not a page.
 */
export async function findStoryForEditor(id: string, viewer: Viewer): Promise<StoryDto | null> {
  const story = await prisma.story.findUnique({ where: { id }, include: STORY_INCLUDE });
  if (!story || story.authorId !== viewer.id) return null;
  return toStoryDto(story);
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** Create a DRAFT owned by the viewer. */
export async function createStory(viewer: Viewer, input: CreateStoryInput): Promise<StoryDto> {
  const bodyHtml = sanitizeStoryHtml(input.bodyHtml);

  return prisma.$transaction(async (tx) => {
    const slug = await nextFreeSlug(tx, input.title);
    const story = await tx.story.create({
      data: {
        authorId: viewer.id,
        title: input.title,
        subtitle: input.subtitle ?? null,
        slug,
        bodyHtml,
        coverImageUrl: input.coverImageUrl ?? null,
        status: 'DRAFT',
        readingTimeMinutes: readingTimeMinutes(bodyHtml),
      },
    });

    await syncStoryTags(tx, story.id, input.tags);
    return toStoryDto(await findStoryOr404(tx, story.id));
  });
}

/**
 * Apply a partial edit.
 *
 * `undefined` means "not mentioned, leave it"; `null` means "clear it". The
 * validation layer preserves that distinction so a PATCH of just the title
 * cannot silently wipe the subtitle or cover image.
 */
export async function updateStory(
  viewer: Viewer,
  id: string,
  input: UpdateStoryInput,
): Promise<StoryDto> {
  return prisma.$transaction(async (tx) => {
    const story = await loadOwnedStory(tx, id, viewer);
    const data: Prisma.StoryUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
      // Invariant 3: drafts follow their title, published URLs are frozen.
      if (story.status === 'DRAFT' && !slugMatchesTitle(story.slug, input.title)) {
        data.slug = await nextFreeSlug(tx, input.title, story.id);
      }
    }
    if (input.subtitle !== undefined) data.subtitle = input.subtitle;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
    if (input.bodyHtml !== undefined) {
      const bodyHtml = sanitizeStoryHtml(input.bodyHtml);
      data.bodyHtml = bodyHtml;
      data.readingTimeMinutes = readingTimeMinutes(bodyHtml);
    }

    await tx.story.update({ where: { id: story.id }, data });
    if (input.tags !== undefined) await syncStoryTags(tx, story.id, input.tags);

    return toStoryDto(await findStoryOr404(tx, story.id));
  });
}

/**
 * The editor's periodic save.
 *
 * Same rules as `updateStory` minus tags (the tag control saves explicitly) and
 * with a looser title: an autosave must never refuse to persist body text just
 * because the title box is still empty.
 */
export async function autosaveStory(
  viewer: Viewer,
  id: string,
  input: AutosaveStoryInput,
): Promise<StoryDto> {
  return prisma.$transaction(async (tx) => {
    const story = await loadOwnedStory(tx, id, viewer);
    const data: Prisma.StoryUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
      if (
        story.status === 'DRAFT' &&
        input.title.length > 0 &&
        !slugMatchesTitle(story.slug, input.title)
      ) {
        data.slug = await nextFreeSlug(tx, input.title, story.id);
      }
    }
    if (input.subtitle !== undefined) data.subtitle = input.subtitle;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
    if (input.bodyHtml !== undefined) {
      const bodyHtml = sanitizeStoryHtml(input.bodyHtml);
      data.bodyHtml = bodyHtml;
      data.readingTimeMinutes = readingTimeMinutes(bodyHtml);
    }

    await tx.story.update({ where: { id: story.id }, data });
    return toStoryDto(await findStoryOr404(tx, story.id));
  });
}

/**
 * Publish. Idempotent: `publishedAt` is stamped only the first time, so
 * re-publishing after an edit does not pretend the story is new.
 */
export async function publishStory(viewer: Viewer, id: string): Promise<StoryDto> {
  return prisma.$transaction(async (tx) => {
    const story = await loadOwnedStory(tx, id, viewer);
    assertPublishable(story);

    const data: Prisma.StoryUpdateInput = { status: 'PUBLISHED' };
    if (story.publishedAt === null) data.publishedAt = new Date();
    // Last chance to fix a slug that never caught up with the title (e.g. the
    // draft was created untitled). After this the URL is frozen.
    if (!slugMatchesTitle(story.slug, story.title)) {
      data.slug = await nextFreeSlug(tx, story.title, story.id);
    }

    await tx.story.update({ where: { id: story.id }, data });
    return toStoryDto(await findStoryOr404(tx, story.id));
  });
}

/**
 * Unpublish back to a draft.
 *
 * `publishedAt` is kept: it records when the story WAS published, and clearing
 * it would let an unpublish/republish cycle rewrite history.
 */
export async function unpublishStory(viewer: Viewer, id: string): Promise<StoryDto> {
  return prisma.$transaction(async (tx) => {
    const story = await loadOwnedStory(tx, id, viewer);
    await tx.story.update({ where: { id: story.id }, data: { status: 'DRAFT' } });
    return toStoryDto(await findStoryOr404(tx, story.id));
  });
}

export type DeletedStory = { id: string; deleted: true };

/**
 * Delete a story and its dependents.
 *
 * StoryTag rows are removed explicitly rather than leaning on the schema's
 * cascade: the join table is this vertical's responsibility, and an explicit
 * delete inside the same transaction is what the test asserts against.
 */
export async function deleteStory(viewer: Viewer, id: string): Promise<DeletedStory> {
  return prisma.$transaction(async (tx) => {
    const story = await loadOwnedStory(tx, id, viewer);
    await tx.storyTag.deleteMany({ where: { storyId: story.id } });
    await tx.story.delete({ where: { id: story.id } });
    return { id: story.id, deleted: true };
  });
}

/** A story needs a real title before it can go out. */
function assertPublishable(story: { title: string }): void {
  const title = story.title.trim();
  if (title.length === 0) {
    throw new AppError('BAD_REQUEST', 'Give your story a title before publishing it');
  }
  if (slugify(title).length === 0) {
    throw new AppError(
      'BAD_REQUEST',
      'Titles need at least one letter or number so the story gets a usable link',
    );
  }
}

export type { StoryDto, StoryStatus };
