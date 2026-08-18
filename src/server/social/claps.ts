import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { MAX_CLAPS_PER_USER } from '@/lib/types';

/**
 * Claps.
 *
 * A clap is not a like: one reader may clap a story up to MAX_CLAPS_PER_USER
 * (50) times, and the Clap row carries that per-user running total. The story's
 * headline number is the SUM of every reader's count.
 *
 * Clapping your own story is allowed — that is a product decision, not an
 * oversight: an author boosting their own piece costs nothing and removing it
 * would mean a special case on every read path.
 */

export type ClapResult = {
  /** Total claps on the story from everyone. */
  storyTotal: number;
  /** Claps this viewer has given this story, after clamping. */
  userCount: number;
  /** The per-user ceiling, so a client never has to hardcode 50. */
  maxPerUser: number;
  /** True when this request was reduced to stay under the ceiling. */
  clamped: boolean;
};

/**
 * Add `count` claps, CLAMPED at the per-user ceiling.
 *
 * Over-cap requests succeed and return the clamped totals rather than failing:
 * a reader hammering the button should end at exactly 50, not see an error at
 * 51. Read-modify-write runs inside a transaction so two concurrent requests
 * cannot both read 49 and write 50 each.
 */
export async function clapStory(
  viewerId: string,
  storyId: string,
  count: number,
): Promise<ClapResult> {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true } });
  if (!story) throw new NotFoundError('That story does not exist');

  const userCount = await prisma.$transaction(async (tx) => {
    const existing = await tx.clap.findUnique({
      where: { userId_storyId: { userId: viewerId, storyId } },
      select: { count: true },
    });

    const current = existing?.count ?? 0;
    const next = Math.min(current + count, MAX_CLAPS_PER_USER);

    if (next !== current) {
      await tx.clap.upsert({
        where: { userId_storyId: { userId: viewerId, storyId } },
        create: { userId: viewerId, storyId, count: next },
        update: { count: next },
      });
    }

    return next;
  });

  return {
    storyTotal: await storyClapTotal(storyId),
    userCount,
    maxPerUser: MAX_CLAPS_PER_USER,
    clamped: userCount === MAX_CLAPS_PER_USER,
  };
}

/** Sum of every reader's claps on a story. */
export async function storyClapTotal(storyId: string): Promise<number> {
  const aggregate = await prisma.clap.aggregate({
    where: { storyId },
    _sum: { count: true },
  });
  return aggregate._sum.count ?? 0;
}

/** How many claps this viewer has given this story (0 when signed out). */
export async function viewerClapCount(
  viewerId: string | null | undefined,
  storyId: string,
): Promise<number> {
  if (!viewerId) return 0;
  const row = await prisma.clap.findUnique({
    where: { userId_storyId: { userId: viewerId, storyId } },
    select: { count: true },
  });
  return row?.count ?? 0;
}
