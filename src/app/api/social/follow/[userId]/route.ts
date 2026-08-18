import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { followUser, unfollowUser } from '@/server/social/follows';
import { parseTargetId } from '@/server/social/schemas';

/**
 * POST/DELETE /api/social/follow/[userId] — follow or unfollow a writer.
 *
 * 401 signed out · 400 malformed id or self-follow · 404 no such user
 * 200 { following, followerCount }
 *
 * Both verbs are IDEMPOTENT. A follow button gets double-clicked and requests
 * get retried; making the second call an error would turn a normal interaction
 * into a red toast. The composite primary key (followerId, followingId) makes a
 * duplicate row structurally impossible, so this holds under concurrency too.
 */

type Context = { params: Promise<{ userId: string }> };

export const POST = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const userId = parseTargetId((await context.params).userId, 'userId');
  return ok(await followUser(viewer.id, userId));
});

export const DELETE = withApi(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const userId = parseTargetId((await context.params).userId, 'userId');
  return ok(await unfollowUser(viewer.id, userId));
});
