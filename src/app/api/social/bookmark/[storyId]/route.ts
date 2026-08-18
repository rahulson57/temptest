import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { addBookmark, removeBookmark } from '@/server/social/bookmarks';
import { parseTargetId } from '@/server/social/schemas';

/**
 * POST/DELETE /api/social/bookmark/[storyId] — save or unsave a story.
 *
 * 401 signed out · 400 malformed id · 404 no such story
 * 200 { bookmarked }
 *
 * Idempotent in both directions: saving twice leaves one row (the composite
 * primary key guarantees it) and un-saving something you never saved succeeds.
 * The alternative — 404 for "you had not bookmarked this" — conflates a missing
 * STORY with a missing BOOKMARK, and the client cannot tell those apart.
 */

type Context = { params: Promise<{ storyId: string }> };

export const POST = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const storyId = parseTargetId((await context.params).storyId, 'storyId');
  return ok(await addBookmark(viewer.id, storyId));
});

export const DELETE = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const storyId = parseTargetId((await context.params).storyId, 'storyId');
  return ok(await removeBookmark(viewer.id, storyId));
});
