/**
 * Snippet extraction and match highlighting.
 *
 * SECURITY: this module never produces HTML. A snippet is a list of
 * `{ text, highlight }` segments and React renders each `text` as a text node,
 * so story content cannot inject markup into a search result no matter what an
 * author wrote. The alternative — wrapping matches in `<mark>` inside a string
 * and calling dangerouslySetInnerHTML — is exactly the stored-XSS hole the
 * sanitizer exists to close, and it would reopen it on the one page that shows
 * text from every story on the site.
 *
 * The input is always PLAIN TEXT (title, subtitle, or `htmlToText(bodyHtml)`),
 * never raw HTML.
 */

export type SnippetSegment = {
  text: string;
  /** True when this run of characters matched one of the query terms. */
  highlight: boolean;
};

/** Characters shown around the first match. Roughly two lines of prose. */
export const SNIPPET_MAX_CHARS = 220;

/** How much text to keep BEFORE the first match, so it reads in context. */
const SNIPPET_LEAD_CHARS = 60;

const ELLIPSIS = '…';

type Range = { start: number; end: number };

/**
 * Build a highlighted snippet of `text` centred on the first matching term.
 *
 * Returns `[]` for empty text. When no term matches (the match was in another
 * field), returns the head of the text as a single unhighlighted segment so the
 * result still shows something readable.
 */
export function buildSnippet(
  text: string,
  terms: string[],
  maxChars: number = SNIPPET_MAX_CHARS,
): SnippetSegment[] {
  const source = text.trim();
  if (source.length === 0) return [];

  const matches = findMatches(source, terms);
  const window = windowFor(source, matches, maxChars);
  const slice = source.slice(window.start, window.end);

  const prefix = window.start > 0 ? ELLIPSIS : '';
  const suffix = window.end < source.length ? ELLIPSIS : '';

  // Keep only matches fully inside the window, rebased onto the slice.
  const inWindow = matches
    .filter((range) => range.start >= window.start && range.end <= window.end)
    .map((range) => ({ start: range.start - window.start, end: range.end - window.start }));

  return segment(slice, inWindow, prefix, suffix);
}

/**
 * All non-overlapping ranges in `text` matched by any term, in document order.
 *
 * Case-insensitive on both sides. Overlapping hits (e.g. "design" and "designs"
 * over the same characters) are merged so a character is never emitted twice.
 */
export function findMatches(text: string, terms: string[]): Range[] {
  const haystack = text.toLowerCase();
  const found: Range[] = [];

  for (const term of terms) {
    const needle = term.toLowerCase();
    if (needle.length === 0) continue;
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index < 0) break;
      found.push({ start: index, end: index + needle.length });
      from = index + needle.length;
    }
  }

  return mergeRanges(found);
}

function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The character window to quote: `maxChars` around the first match. */
function windowFor(text: string, matches: Range[], maxChars: number): Range {
  if (text.length <= maxChars) return { start: 0, end: text.length };

  const first = matches[0];
  if (!first) return { start: 0, end: maxChars };

  const rawStart = Math.max(0, first.start - SNIPPET_LEAD_CHARS);
  const start = snapToWordStart(text, rawStart);
  const end = Math.min(text.length, start + maxChars);
  return { start, end };
}

/** Move `index` forward to the next word boundary so a snippet never starts mid-word. */
function snapToWordStart(text: string, index: number): number {
  if (index <= 0) return 0;
  const space = text.indexOf(' ', index);
  // Only snap if the next space is nearby; otherwise a long unbroken token
  // (a URL, say) would push the window past the match it is meant to show.
  if (space >= 0 && space - index <= 20) return space + 1;
  return index;
}

/** Split `text` into alternating plain/highlighted segments. */
function segment(
  text: string,
  matches: Range[],
  prefix: string,
  suffix: string,
): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  const push = (value: string, highlight: boolean) => {
    if (value.length === 0) return;
    const last = segments[segments.length - 1];
    if (last && last.highlight === highlight) last.text += value;
    else segments.push({ text: value, highlight });
  };

  push(prefix, false);

  let cursor = 0;
  for (const range of matches) {
    push(text.slice(cursor, range.start), false);
    push(text.slice(range.start, range.end), true);
    cursor = range.end;
  }
  push(text.slice(cursor), false);
  push(suffix, false);

  return segments;
}

/** Flatten a snippet back to plain text — used in tests and meta descriptions. */
export function snippetText(segments: SnippetSegment[]): string {
  return segments.map((part) => part.text).join('');
}
