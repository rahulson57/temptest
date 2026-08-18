/**
 * TRENDING — the ranking formula, written down.
 *
 * A trending tab that nobody can reason about becomes folklore ("why is that
 * post still there?"), so the score is deliberately small, pure and testable.
 *
 *   engagement = CLAP_WEIGHT * clapsInWindow + COMMENT_WEIGHT * commentsInWindow
 *   decay      = 0.5 ** (ageHours / TRENDING_HALF_LIFE_HOURS)
 *   score      = round(engagement * decay, TRENDING_SCORE_PRECISION)
 *
 * where
 *   - clapsInWindow    = SUM(Clap.count) for claps CREATED in the last
 *                        TRENDING_WINDOW_DAYS (7) days,
 *   - commentsInWindow = COUNT of non-deleted comments created in that window,
 *   - ageHours         = max(0, now - publishedAt) in hours; an unpublished or
 *                        future-dated story scores 0 / gets no age bonus,
 *   - the half-life is 72h, so yesterday's 10 claps beat last week's 20.
 *
 * PROPERTIES THIS BUYS (all asserted in tests/feed/trending.test.ts):
 *   - Deterministic: pure function of (claps, comments, publishedAt, now).
 *     No wall clock, no randomness — callers inject `now`.
 *   - Engagement outside the 7-day window cannot lift a story at all, so an
 *     old post cannot camp the tab on lifetime totals.
 *   - Conversation counts for more than applause (3:1), because a comment is
 *     the more expensive signal to fake and to give.
 *   - Rounded to 6 decimal places so two mathematically-equal scores compare
 *     equal despite float drift, and the documented tie-break decides instead.
 */

export const TRENDING_WINDOW_DAYS = 7;
export const TRENDING_HALF_LIFE_HOURS = 72;
export const TRENDING_CLAP_WEIGHT = 1;
export const TRENDING_COMMENT_WEIGHT = 3;
export const TRENDING_SCORE_PRECISION = 6;

/**
 * How many recent published stories are scored for the trending tab.
 *
 * Trending is ranked in application code (the score is not expressible as a
 * SQL ORDER BY), so the candidate set has to be bounded. At a 72h half-life a
 * story outside the newest 200 has decayed past any realistic engagement, and
 * the bound keeps the tab O(1) in queries and memory as the archive grows.
 */
export const TRENDING_CANDIDATE_LIMIT = 200;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Start of the engagement window: `now` minus TRENDING_WINDOW_DAYS. */
export function trendingWindowStart(now: Date): Date {
  return new Date(now.getTime() - TRENDING_WINDOW_DAYS * MS_PER_DAY);
}

export type TrendingScoreInput = {
  /** SUM(Clap.count) inside the window. */
  claps: number;
  /** Non-deleted comments inside the window. */
  comments: number;
  publishedAt: Date | null;
  now: Date;
};

/** The formula documented at the top of this file. Pure. */
export function trendingScore({ claps, comments, publishedAt, now }: TrendingScoreInput): number {
  if (!publishedAt) return 0;

  const engagement = TRENDING_CLAP_WEIGHT * claps + TRENDING_COMMENT_WEIGHT * comments;
  if (engagement <= 0) return 0;

  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / MS_PER_HOUR);
  const decay = Math.pow(0.5, ageHours / TRENDING_HALF_LIFE_HOURS);

  return roundScore(engagement * decay);
}

/** Round to TRENDING_SCORE_PRECISION decimals so float noise cannot break ties. */
export function roundScore(value: number): number {
  const factor = Math.pow(10, TRENDING_SCORE_PRECISION);
  return Math.round(value * factor) / factor;
}

export type Rankable = { score: number; publishedAt: Date | null; id: string };

/**
 * Total order for the trending tab: score desc, then newest first, then id asc.
 *
 * The two tie-breaks are what make paging stable — without them SQLite may
 * return equal-scored rows in any order and a cursor could skip or repeat one.
 */
export function compareTrending(a: Rankable, b: Rankable): number {
  if (a.score !== b.score) return b.score - a.score;
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  if (at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
