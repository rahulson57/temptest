import { z } from 'zod';

/**
 * Cursor pagination.
 *
 * Every list endpoint uses this — offset pagination drifts as rows are inserted,
 * which on a feed means readers see duplicates. The cursor is the id of the last
 * item in the page; callers pass it back as `?cursor=`.
 *
 * Query one extra row (`takeWithLookahead`) to learn whether another page exists
 * without a second COUNT query.
 */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export type PageParams = { limit: number; cursor?: string };

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

/** Zod schema for `?limit=&cursor=` on any list route. */
export const pageQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

/** Clamp an arbitrary limit into [1, MAX_PAGE_SIZE], defaulting when absent/invalid. */
export function normalizeLimit(limit?: number | string | null): number {
  const parsed = typeof limit === 'string' ? Number.parseInt(limit, 10) : limit;
  if (parsed == null || Number.isNaN(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

/** Normalize raw query input into safe page params. */
export function pageParams(input?: {
  limit?: number | string | null;
  cursor?: string | null;
}): PageParams {
  const limit = normalizeLimit(input?.limit);
  const cursor = input?.cursor?.trim();
  return cursor ? { limit, cursor } : { limit };
}

/**
 * Prisma args for a cursor page. Spread into findMany:
 *
 *   const rows = await prisma.story.findMany({
 *     where: { status: 'PUBLISHED' },
 *     orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
 *     ...prismaPageArgs(params),
 *   });
 *   return toPage(rows, params.limit);
 */
export function prismaPageArgs(params: PageParams): {
  take: number;
  cursor?: { id: string };
  skip?: number;
} {
  const take = params.limit + 1; // lookahead row
  if (!params.cursor) return { take };
  return { take, cursor: { id: params.cursor }, skip: 1 };
}

/** Number of rows to fetch for a page of `limit` (includes the lookahead row). */
export function takeWithLookahead(limit: number): number {
  return normalizeLimit(limit) + 1;
}

/**
 * Trim the lookahead row off a result set and derive nextCursor.
 * `rows` must be the array fetched with `take = limit + 1`.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const size = normalizeLimit(limit);
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
  };
}

/** Same as toPage but for rows whose cursor field is not `id`. */
export function toPageBy<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const size = normalizeLimit(limit);
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last !== undefined ? cursorOf(last) : null,
  };
}

/** Empty page constant for early returns. */
export function emptyPage<T>(): Page<T> {
  return { items: [], nextCursor: null };
}
