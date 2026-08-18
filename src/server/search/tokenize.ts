/**
 * Query tokenization and field-weighted scoring.
 *
 * SQLite has no full-text index in this schema (adding one would mean a
 * migration, and `prisma/**` is closed), so search is a two-stage affair:
 *
 *   1. SQL narrows the archive to candidate rows with a coarse LIKE filter.
 *   2. THIS module decides what actually matched and how well.
 *
 * Stage 2 is authoritative for two reasons: the body is stored as HTML and must
 * be stripped before matching (otherwise a search for "href" hits every story
 * with a link), and the ranking is field-weighted, which SQL cannot express
 * here. Both stages are case-insensitive.
 */

/** Longest query accepted. Longer is rejected with a 400, not truncated. */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Terms scored per query. A pathological "a b c d e f g h i j k l" would
 * otherwise multiply the scan cost for no gain in answer quality.
 */
export const MAX_SEARCH_TERMS = 8;

/** Field weights — a title hit outranks a subtitle hit outranks a body hit. */
export const TITLE_WEIGHT = 10;
export const SUBTITLE_WEIGHT = 4;
export const BODY_WEIGHT = 1;

/**
 * Split a raw query into lowercase terms.
 *
 * Unicode-aware: letters and numbers are kept, everything else is a separator,
 * so `"design-systems, 2024!"` becomes `['design', 'systems', '2024']`.
 * Duplicates are dropped so repeating a word cannot inflate a story's score.
 */
export function tokenizeQuery(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string') return [];
  const parts = raw.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const seen = new Set<string>();
  for (const part of parts) {
    if (part.length === 0) continue;
    seen.add(part);
    if (seen.size >= MAX_SEARCH_TERMS) break;
  }
  return [...seen];
}

export type MatchedField = 'title' | 'subtitle' | 'body';

export type FieldTexts = {
  title: string;
  subtitle: string | null;
  /** The body with HTML already stripped (via `htmlToText`). */
  body: string;
};

export type MatchResult = {
  score: number;
  /** Distinct terms that matched anywhere. Used for highlighting. */
  matchedTerms: string[];
  /** The strongest field that matched, for the snippet to quote. */
  matchedIn: MatchedField | null;
};

/**
 * Score one story against the query terms.
 *
 *   score = Σ over distinct terms of
 *           TITLE_WEIGHT·(term in title) + SUBTITLE_WEIGHT·(term in subtitle)
 *           + BODY_WEIGHT·(term in body)
 *
 * A term is counted once per field however often it occurs, so a keyword
 * stuffed into a body 50 times cannot outrank a genuine title match. Matching
 * more DISTINCT terms therefore beats matching one term everywhere, which is
 * the behaviour a reader expects from a multi-word query.
 */
export function scoreStory(texts: FieldTexts, terms: string[]): MatchResult {
  const title = texts.title.toLowerCase();
  const subtitle = (texts.subtitle ?? '').toLowerCase();
  const body = texts.body.toLowerCase();

  let score = 0;
  const matchedTerms: string[] = [];
  let inTitle = false;
  let inSubtitle = false;
  let inBody = false;

  for (const term of terms) {
    let matched = false;
    if (title.includes(term)) {
      score += TITLE_WEIGHT;
      inTitle = true;
      matched = true;
    }
    if (subtitle.includes(term)) {
      score += SUBTITLE_WEIGHT;
      inSubtitle = true;
      matched = true;
    }
    if (body.includes(term)) {
      score += BODY_WEIGHT;
      inBody = true;
      matched = true;
    }
    if (matched) matchedTerms.push(term);
  }

  const matchedIn: MatchedField | null = inTitle
    ? 'title'
    : inSubtitle
      ? 'subtitle'
      : inBody
        ? 'body'
        : null;

  return { score, matchedTerms, matchedIn };
}
