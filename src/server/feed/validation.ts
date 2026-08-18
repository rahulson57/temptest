import { z } from 'zod';
import { BadRequestError } from '@/lib/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageParams } from '@/lib/pagination';
import { MAX_SEARCH_QUERY_LENGTH } from '../search/tokenize';

/**
 * Query validation for the discovery endpoints.
 *
 * Deliberately NOT `pageQuerySchema`: that schema `.catch()`es a bad limit back
 * to the default, which is right for a page (a reader who hand-edits a URL
 * should still see the feed) but wrong for an API, where silently ignoring
 * `?limit=1000` hides a client bug. Here an invalid limit is a 400.
 *
 * `BadRequestError` (400), not `ValidationError` (422): these are malformed
 * query parameters, not a well-formed body that failed a business rule.
 */

export const FEED_SCOPES = ['personal', 'global', 'trending'] as const;
export type FeedScopeInput = (typeof FEED_SCOPES)[number];

const limitSchema = z.coerce
  .number({ invalid_type_error: 'limit must be a number' })
  .int('limit must be a whole number')
  .min(1, 'limit must be at least 1')
  .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}`)
  .optional();

const cursorSchema = z.string().trim().min(1).max(64).optional();

export const feedQuerySchema = z.object({
  scope: z
    .enum(FEED_SCOPES, {
      errorMap: () => ({ message: `scope must be one of ${FEED_SCOPES.join(', ')}` }),
    })
    .default('global'),
  limit: limitSchema,
  cursor: cursorSchema,
});

/**
 * `q` is OPTIONAL and may be blank — an empty search is a prompt, not an error
 * (the criteria say so explicitly: empty query → empty result set, never a
 * 500). But an over-long one IS rejected rather than truncated, so a client
 * never gets silently different results from the ones it asked for.
 */
export const searchQuerySchema = z.object({
  q: z
    .string()
    .max(
      MAX_SEARCH_QUERY_LENGTH,
      `q must be at most ${MAX_SEARCH_QUERY_LENGTH} characters`,
    )
    .optional(),
  limit: limitSchema,
  cursor: cursorSchema,
});

export type FeedQuery = { scope: FeedScopeInput; page: PageParams };

/** Parse `?scope=&limit=&cursor=`, throwing a 400 on anything malformed. */
export function parseFeedQuery(request: Request): FeedQuery {
  const raw = searchParams(request);
  const result = feedQuerySchema.safeParse(raw);
  if (!result.success) throw badRequest(result.error);

  const { scope, limit, cursor } = result.data;
  return { scope, page: toPageParams(limit, cursor) };
}

export type SearchQuery = { q: string; page: PageParams };

/** Parse `?q=&limit=&cursor=`, throwing a 400 on a malformed limit or cursor. */
export function parseSearchQuery(request: Request): SearchQuery {
  const raw = searchParams(request);
  const result = searchQuerySchema.safeParse(raw);
  if (!result.success) throw badRequest(result.error);

  const { q, limit, cursor } = result.data;
  return { q: q ?? '', page: toPageParams(limit, cursor) };
}

function searchParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function toPageParams(limit: number | undefined, cursor: string | undefined): PageParams {
  const size = limit ?? DEFAULT_PAGE_SIZE;
  return cursor ? { limit: size, cursor } : { limit: size };
}

function badRequest(error: z.ZodError): BadRequestError {
  const issue = error.issues[0];
  return new BadRequestError(issue ? issue.message : 'Invalid query parameters');
}
