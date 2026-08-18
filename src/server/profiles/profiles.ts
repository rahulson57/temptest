import { PUBLIC_USER_SELECT, assertOwner } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { normalizeLimit, toPage, type Page, type PageParams } from '@/lib/pagination';
import { storage } from '@/lib/storage';
import type { StorageFile } from '@/lib/storage';
import type { PublicUser, StorySummary } from '@/lib/types';
import { followCounts, isFollowingUser } from '@/server/social/follows';
import { STORY_SUMMARY_SELECT, toStorySummaries, type StoryRow } from '@/server/social/story-summary';
import type { UpdateProfileInput } from './schemas';

/**
 * Public profiles and profile editing.
 *
 * The profile page is SERVER-RENDERED from `loadProfile()` — one function that
 * resolves the user, their follower/following counts, the viewer's follow state
 * and a page of their published stories. Keeping it here (rather than in the
 * page component) is what makes "drafts never appear on a profile" a unit-
 * testable claim instead of a JSX detail.
 */

export type ProfileHeader = PublicUser & {
  followerCount: number;
  followingCount: number;
  /** Whether the signed-in viewer follows this profile. False when signed out. */
  viewerIsFollowing: boolean;
  /** True when the viewer is looking at their own profile. */
  isViewer: boolean;
};

export type ProfilePageData = {
  profile: ProfileHeader;
  stories: Page<StorySummary>;
};

/** Public user by handle. Throws NotFoundError → the page renders a 404. */
export async function getProfileByHandle(handle: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { handle: handle.trim().toLowerCase() },
    select: PUBLIC_USER_SELECT,
  });
  if (!user) throw new NotFoundError('That profile does not exist');
  return user;
}

/**
 * Everything the profile page renders, in a fixed number of queries.
 *
 * `viewerId` is the signed-in user's id (null when signed out) — the follow
 * state is resolved ONCE here rather than by <FollowButton> fetching its own,
 * so the first paint is already correct.
 */
export async function loadProfile(
  handle: string,
  viewerId: string | null,
  params: PageParams,
): Promise<ProfilePageData> {
  const user = await getProfileByHandle(handle);

  const [counts, viewerIsFollowing, stories] = await Promise.all([
    followCounts(user.id),
    viewerId && viewerId !== user.id ? isFollowingUser(viewerId, user.id) : Promise.resolve(false),
    listPublishedStoriesByAuthor(user.id, params),
  ]);

  return {
    profile: {
      ...user,
      followerCount: counts.followers,
      followingCount: counts.following,
      viewerIsFollowing,
      isViewer: viewerId === user.id,
    },
    stories,
  };
}

/**
 * One author's PUBLISHED stories, most recent first.
 *
 * `status: 'PUBLISHED'` is not decoration: without it an author's drafts would
 * be readable by anyone who visited their profile. The
 * (authorId, status, publishedAt DESC) index in prisma/schema.prisma covers
 * exactly this query.
 */
export async function listPublishedStoriesByAuthor(
  authorId: string,
  params: PageParams,
): Promise<Page<StorySummary>> {
  const limit = normalizeLimit(params.limit);

  const rows = await prisma.story.findMany({
    where: { authorId, status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // lookahead row
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: STORY_SUMMARY_SELECT,
  });

  const page = toPage(rows, limit);
  const items = await toStorySummaries(page.items as StoryRow[]);
  return { items, nextCursor: page.nextCursor };
}

/**
 * Update a profile.
 *
 * `targetUserId` is passed explicitly and checked with `assertOwner` rather
 * than being implied by the session: authentication is not authorization, and a
 * route that only ever edits "me" today is one refactor away from accepting an
 * id from the URL. Editing someone else → 403.
 *
 * Only keys PRESENT in `input` are written (PATCH semantics).
 */
export async function updateProfile(
  viewer: { id: string },
  targetUserId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  assertOwner(targetUserId, viewer);

  const data: { displayName?: string; bio?: string | null; avatarUrl?: string | null } = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.bio !== undefined) data.bio = input.bio === '' ? null : input.bio;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl === '' ? null : input.avatarUrl;

  return prisma.user.update({
    where: { id: targetUserId },
    data,
    select: PUBLIC_USER_SELECT,
  });
}

/**
 * Store an avatar image and point the user's profile at it.
 *
 * Type and size validation live in the StorageAdapter (`@/lib/storage`), which
 * checks the DECLARED size and then the actual bytes, so this route inherits
 * the same rules as every other upload instead of re-implementing them. A
 * rejected file throws BadRequestError → 400.
 *
 * The Upload row is the bookkeeping record of what was written, so orphaned
 * files can be reconciled later.
 */
export async function updateAvatar(
  viewer: { id: string },
  targetUserId: string,
  file: StorageFile,
): Promise<PublicUser> {
  assertOwner(targetUserId, viewer);

  const result = await storage.put(file);

  await prisma.upload.create({
    data: {
      ownerId: targetUserId,
      key: result.key,
      url: result.url,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  return prisma.user.update({
    where: { id: targetUserId },
    data: { avatarUrl: result.url },
    select: PUBLIC_USER_SELECT,
  });
}
