import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { followTag, unfollowTag } from '@/server/social/follows';
import { parseTargetId } from '@/server/social/schemas';

/**
 * POST/DELETE /api/social/follow-tag/[tagId] — follow or unfollow a topic.
 *
 * 401 signed out · 400 malformed id · 404 no such tag
 * 200 { following, followerCount }
 *
 * Idempotent, same as following a writer. There is no self-follow case for a
 * tag — a tag has no owner — so the only rejection is a missing or malformed id.
 */

type Context = { params: Promise<{ tagId: string }> };

export const POST = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const tagId = parseTargetId((await context.params).tagId, 'tagId');
  return ok(await followTag(viewer.id, tagId));
});

export const DELETE = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const tagId = parseTargetId((await context.params).tagId, 'tagId');
  return ok(await unfollowTag(viewer.id, tagId));
});
