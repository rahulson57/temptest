import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';

/**
 * Follow graph — writers and tags.
 *
 * Every mutation here is IDEMPOTENT: following twice is a no-op that returns the
 * same state, and unfollowing something you never followed succeeds. A follow
 * button is fired by impatient double-clicks and by retried requests; making the
 * second call an error would turn a normal interaction into a red toast.
 * The composite primary keys in prisma/schema.prisma make a duplicate row
 * structurally impossible, so idempotency is enforced by the data model too.
 */

export type FollowState = {
  following: boolean;
  followerCount: number;
};

export type TagFollowState = {
  following: boolean;
  followerCount: number;
};

/** Follow a writer. Self-follow → 400, unknown user → 404. */
export async function followUser(viewerId: string, targetUserId: string): Promise<FollowState> {
  assertNotSelf(viewerId, targetUserId);
  await assertUserExists(targetUserId);

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } },
    create: { followerId: viewerId, followingId: targetUserId },
    update: {},
  });

  return userFollowState(viewerId, targetUserId);
}

/** Unfollow a writer. Unknown user → 404; not currently following → success. */
export async function unfollowUser(viewerId: string, targetUserId: string): Promise<FollowState> {
  assertNotSelf(viewerId, targetUserId);
  await assertUserExists(targetUserId);

  // deleteMany, not delete: delete throws P2025 when the row is absent, which
  // would make a repeated unfollow a 500.
  await prisma.follow.deleteMany({
    where: { followerId: viewerId, followingId: targetUserId },
  });

  return userFollowState(viewerId, targetUserId);
}

/** Follow a tag. Unknown tag → 404. */
export async function followTag(viewerId: string, tagId: string): Promise<TagFollowState> {
  await assertTagExists(tagId);

  await prisma.tagFollow.upsert({
    where: { userId_tagId: { userId: viewerId, tagId } },
    create: { userId: viewerId, tagId },
    update: {},
  });

  return tagFollowState(viewerId, tagId);
}

/** Unfollow a tag. Unknown tag → 404; not currently following → success. */
export async function unfollowTag(viewerId: string, tagId: string): Promise<TagFollowState> {
  await assertTagExists(tagId);

  await prisma.tagFollow.deleteMany({ where: { userId: viewerId, tagId } });

  return tagFollowState(viewerId, tagId);
}

/** Whether `viewerId` follows `targetUserId`. False when signed out. */
export async function isFollowingUser(
  viewerId: string | null | undefined,
  targetUserId: string,
): Promise<boolean> {
  if (!viewerId) return false;
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } },
    select: { followerId: true },
  });
  return row !== null;
}

/** Follower / following totals for a profile header. */
export async function followCounts(
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followers, following };
}

function assertNotSelf(viewerId: string, targetUserId: string): void {
  if (viewerId === targetUserId) {
    throw new BadRequestError('You cannot follow yourself');
  }
}

async function assertUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('That writer does not exist');
}

async function assertTagExists(tagId: string): Promise<void> {
  const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } });
  if (!tag) throw new NotFoundError('That topic does not exist');
}

async function userFollowState(viewerId: string, targetUserId: string): Promise<FollowState> {
  const [following, followerCount] = await Promise.all([
    isFollowingUser(viewerId, targetUserId),
    prisma.follow.count({ where: { followingId: targetUserId } }),
  ]);
  return { following, followerCount };
}

async function tagFollowState(viewerId: string, tagId: string): Promise<TagFollowState> {
  const [row, followerCount] = await Promise.all([
    prisma.tagFollow.findUnique({
      where: { userId_tagId: { userId: viewerId, tagId } },
      select: { userId: true },
    }),
    prisma.tagFollow.count({ where: { tagId } }),
  ]);
  return { following: row !== null, followerCount };
}
