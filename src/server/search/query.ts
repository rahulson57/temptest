import { prisma } from '@/lib/db';
import { htmlToText } from '@/lib/sanitize';
import type { Page, PageParams } from '@/lib/pagination';
import type { StorySummary } from '@/lib/types';
import type { FeedDb } from '../feed/db';
import {
  PUBLISHED_WHERE,
  RECENT_FIRST,
  STORY_SUMMARY_SELECT,
  loadStorySummaries,
  type StoryRow,
} from '../feed/select';
import { sliceByCursor } from '../feed/queries';
import {
  MAX_SEARCH_QUERY_LENGTH,
  scoreStory,
  tokenizeQuery,
  type MatchedField,
} from './tokenize';
import { buildSnippet, type SnippetSegment } from './highlight';

/**
 * SEARCH — two stages, and why.
 *
 * 1. SQL narrows the archive: a single `findMany` with one OR-arm per term per
 *    field. SQLite's LIKE is case-insensitive for ASCII, which is what Prisma's
 *    `contains` compiles to here (`mode: 'insensitive'` is a no-op on SQLite),
 *    so the coarse filter is already case-insensitive.
 * 2. `scoreStory` decides what actually matched and how well, over the body
 *    with HTML STRIPPED. Stage 1 matches against `bodyHtml`, so on its own a
 *    search for "href" or "strong" would hit every story containing a link or
 *    bold text. Stage 2 is authoritative and drops those.
 *
 * Ranking (title > subtitle > body) is a field-weighted sum that SQL cannot
 * express here, so it happens in application code — which means the candidate
 * set must be bounded. See SEARCH_CANDIDATE_LIMIT.
 *
 * INVARIANTS
 *  - PUBLISHED only. A draft is never discoverable through search.
 *  - Always a cursor page (default 10, max 50).
 *  - Query count is constant in the page size: one candidate query, one clap
 *    aggregate. No per-result lookups.
 */

/**
 * How many candidate rows are scored. Search ranks in memory, so the work has
 * to be bounded; the SQL pre-filter has already thrown away everything that
 * contains none of the terms, and rows are considered newest-first.
 */
export const SEARCH_CANDIDATE_LIMIT = 200;

export type SearchResult = {
  story: StorySummary;
  /** Field-weighted relevance. Higher is better. See tokenize.ts. */
  score: number;
  /** The strongest field that matched — what the snippet quotes. */
  matchedIn: MatchedField | null;
  /** Distinct query terms this story matched, for highlighting. */
  matchedTerms: string[];
  /** Plain-text snippet split into highlighted / unhighlighted runs. */
  snippet: SnippetSegment[];
};

export type SearchPage = Page<SearchResult> & {
  /** The query as the reader typed it (trimmed). */
  query: string;
  /** The terms it tokenized to. Empty means "no query", not "no results". */
  terms: string[];
};

/** An empty page that still reports the query — the "prompt me" state. */
function emptySearchPage(query: string, terms: string[]): SearchPage {
  return { items: [], nextCursor: null, query, terms };
}

/**
 * Search PUBLISHED stories by title, subtitle and body text.
 *
 * An empty or whitespace-only query is a normal, non-error outcome: it returns
 * an empty page so the UI can prompt instead of blowing up. Length validation
 * belongs at the boundary (`searchQuerySchema` → 400); this function does not
 * throw for a long query, it simply never gets one.
 */
export async function searchStories(
  rawQuery: string,
  params: PageParams,
  db: FeedDb = prisma,
): Promise<SearchPage> {
  const query = (rawQuery ?? '').trim();
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return emptySearchPage(query, terms);

  const candidates = (await db.story.findMany({
    where: {
      ...PUBLISHED_WHERE,
      OR: terms.flatMap((term) => [
        { title: { contains: term } },
        { subtitle: { contains: term } },
        { bodyHtml: { contains: term } },
      ]),
    },
    orderBy: RECENT_FIRST,
    take: SEARCH_CANDIDATE_LIMIT,
    select: STORY_SUMMARY_SELECT,
  })) as StoryRow[];

  if (candidates.length === 0) return emptySearchPage(query, terms);

  const ranked = candidates
    .map((row) => {
      const bodyText = htmlToText(row.bodyHtml);
      const match = scoreStory(
        { title: row.title, subtitle: row.subtitle, body: bodyText },
        terms,
      );
      return { id: row.id, row, bodyText, publishedAt: row.publishedAt, ...match };
    })
    // Stage-2 rejects: matched only inside markup, so not a real hit.
    .filter((entry) => entry.score > 0)
    .sort(compareRelevance);

  if (ranked.length === 0) return emptySearchPage(query, terms);

  // Page the ranked list, then hydrate ONLY the visible rows.
  const slice = sliceByCursor(ranked, params);
  const stories = await loadStorySummaries(
    slice.entries.map((entry) => entry.row),
    db,
  );

  const items = slice.entries.map((entry, index) => ({
    story: stories[index] as StorySummary,
    score: entry.score,
    matchedIn: entry.matchedIn,
    matchedTerms: entry.matchedTerms,
    snippet: buildSnippet(snippetSource(entry), entry.matchedTerms),
  }));

  return { items, nextCursor: slice.nextCursor, query, terms };
}

/**
 * Relevance desc, then newest first, then id asc.
 *
 * The two tie-breaks give equal-scoring rows a total order, which is what makes
 * the cursor stable — without them SQLite could hand back the same score set in
 * a different order on the next page and a result would repeat or vanish.
 */
function compareRelevance(
  a: { score: number; publishedAt: Date | null; id: string },
  b: { score: number; publishedAt: Date | null; id: string },
): number {
  if (a.score !== b.score) return b.score - a.score;
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  if (at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Quote the strongest matching field; fall back to the body. */
function snippetSource(entry: {
  matchedIn: MatchedField | null;
  row: StoryRow;
  bodyText: string;
}): string {
  if (entry.matchedIn === 'title') return entry.row.title;
  if (entry.matchedIn === 'subtitle') return entry.row.subtitle ?? '';
  return entry.bodyText;
}

export type SearchInput =
  | { ok: true; q: string }
  | { ok: false; q: string; error: string };

/**
 * Validate a raw `?q=` for a PAGE (not the API).
 *
 * A reader who pastes a novel into the search box should get a polite message,
 * not a 500 and not a stack trace — but the rule is the same 200-character rule
 * the API enforces with a 400, expressed once here so the two cannot drift.
 */
export function normalizeSearchInput(raw: string | null | undefined): SearchInput {
  const q = typeof raw === 'string' ? raw.trim() : '';
  if (q.length > MAX_SEARCH_QUERY_LENGTH) {
    return {
      ok: false,
      q,
      error: `Search queries are limited to ${MAX_SEARCH_QUERY_LENGTH} characters.`,
    };
  }
  return { ok: true, q };
}
