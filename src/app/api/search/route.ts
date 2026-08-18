import type { NextRequest } from 'next/server';
import { ok, withApi } from '@/lib/api';
import { parseSearchQuery } from '@/server/feed/validation';
import { searchStories } from '@/server/search/query';

/**
 * GET /api/search?q=&cursor=&limit=
 *
 * Envelope: { ok: true, data: { query, terms, items, nextCursor } } where each
 * item is { story, score, matchedIn, matchedTerms, snippet }.
 *
 * `snippet` is a list of `{ text, highlight }` segments, NOT an HTML string —
 * see src/server/search/highlight.ts. Clients render each `text` as a text node,
 * so story content can never inject markup into a result.
 *
 * Two boundary rules, both from the acceptance criteria:
 *  - empty or whitespace `q` → 200 with an empty item list (a prompt, not a 500)
 *  - `q` longer than 200 characters → 400
 */
export const GET = withApi(async (request: NextRequest) => {
  const { q, page } = parseSearchQuery(request);
  return ok(await searchStories(q, page));
});

export const dynamic = 'force-dynamic';
