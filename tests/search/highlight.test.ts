import { describe, expect, it } from 'vitest';
import {
  SNIPPET_MAX_CHARS,
  buildSnippet,
  findMatches,
  snippetText,
} from '@/server/search/highlight';

/**
 * SNIPPETS — a pure unit suite, because the security property lives here.
 *
 * The invariant every test below defends: a snippet is a list of plain-text
 * segments. There is no code path that turns story content into an HTML string,
 * so there is nothing for a page to inject.
 */

describe('findMatches', () => {
  it('finds every occurrence, case-insensitively', () => {
    expect(findMatches('Cats and CATS and cats', ['cats'])).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 13 },
      { start: 18, end: 22 },
    ]);
  });

  it('merges overlapping matches so no character is emitted twice', () => {
    // "design" and "designs" overlap on the same characters.
    const ranges = findMatches('designs everywhere', ['design', 'designs']);

    expect(ranges).toEqual([{ start: 0, end: 7 }]);
  });

  it('returns nothing for terms that do not occur, or for no terms', () => {
    expect(findMatches('hello world', ['xyz'])).toEqual([]);
    expect(findMatches('hello world', [])).toEqual([]);
    expect(findMatches('hello world', [''])).toEqual([]);
  });
});

describe('buildSnippet', () => {
  it('splits text into highlighted and plain segments', () => {
    const segments = buildSnippet('The quick brown fox', ['brown']);

    expect(segments).toEqual([
      { text: 'The quick ', highlight: false },
      { text: 'brown', highlight: true },
      { text: ' fox', highlight: false },
    ]);
  });

  it('preserves the original casing of the matched text', () => {
    const segments = buildSnippet('The Brown Fox', ['brown']);

    expect(segments.find((part) => part.highlight)?.text).toBe('Brown');
  });

  it('round-trips: the segments concatenate back to the quoted text', () => {
    const text = 'Alpha beta gamma delta';
    const segments = buildSnippet(text, ['beta', 'delta']);

    expect(snippetText(segments)).toBe(text);
    expect(segments.filter((part) => part.highlight).map((part) => part.text)).toEqual([
      'beta',
      'delta',
    ]);
  });

  it('returns an empty list for empty or whitespace-only text', () => {
    expect(buildSnippet('', ['x'])).toEqual([]);
    expect(buildSnippet('   ', ['x'])).toEqual([]);
  });

  it('returns readable text even when nothing matches', () => {
    const segments = buildSnippet('Some prose with no hits at all', ['zebra']);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.highlight).toBe(false);
    expect(snippetText(segments)).toContain('Some prose');
  });

  it('windows long text around the FIRST match and marks the elision', () => {
    const filler = 'padding '.repeat(80); // ~640 chars before the match
    const text = `${filler}needle and then more words after it`;

    const segments = buildSnippet(text, ['needle']);
    const rendered = snippetText(segments);

    expect(rendered).toContain('needle');
    expect(rendered.startsWith('…')).toBe(true);
    // Bounded: the whole 600-plus-character text is not returned.
    expect(rendered.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS + 2);
    expect(segments.filter((part) => part.highlight).map((part) => part.text)).toEqual(['needle']);
  });

  it('does not prepend an ellipsis when the match is already at the start', () => {
    const text = `needle ${'tail '.repeat(80)}`;

    const rendered = snippetText(buildSnippet(text, ['needle']));

    expect(rendered.startsWith('…')).toBe(false);
    expect(rendered.endsWith('…')).toBe(true);
  });

  it('handles several distinct terms in one snippet', () => {
    const segments = buildSnippet('Coffee, tea, and cocoa', ['coffee', 'cocoa']);

    expect(segments.filter((part) => part.highlight).map((part) => part.text)).toEqual([
      'Coffee',
      'cocoa',
    ]);
  });

  it('treats HTML-looking text as ORDINARY CHARACTERS, never as markup', () => {
    // If a body ever reached this function unstripped, the tags would still be
    // plain text in a plain-text segment — there is no tag-aware code path.
    const text = 'A tag like <script>alert(1)</script> is just characters here';

    const segments = buildSnippet(text, ['script']);
    const rendered = snippetText(segments);

    expect(rendered).toContain('<script>');
    // The angle brackets sit inside a `text` field. React renders that as a
    // text node; nothing in this module produces an HTML string to inject.
    expect(segments.every((part) => typeof part.text === 'string')).toBe(true);
    expect(segments.filter((part) => part.highlight).map((part) => part.text)).toEqual([
      'script',
      'script',
    ]);
  });
});
