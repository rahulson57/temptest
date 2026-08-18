import { beforeEach, describe, expect, it } from 'vitest';
import { buildRequest, callRoute, expectOk } from '../helpers/request';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { GET } from '@/app/api/search/route';
import { normalizeSearchInput } from '@/server/search/query';
import { MAX_SEARCH_QUERY_LENGTH } from '@/server/search/tokenize';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

/**
 * GET /api/search — the boundary rules.
 *
 * The interesting cases are the two edges the criteria name: an EMPTY query is
 * a 200 with no results (a prompt), and an OVER-LONG query is a 400 (rejected,
 * never silently truncated — a client that gets results for a query it did not
 * send has no way to notice).
 */

type SearchBody = {
  query: string;
  terms: string[];
  items: { story: { title: string }; snippet: { text: string; highlight: boolean }[] }[];
  nextCursor: string | null;
};

async function search(query: Record<string, string | number | undefined>) {
  return callRoute<SearchBody>(GET, await buildRequest('/api/search', { query }));
}

const NOW = new Date('2025-03-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  resetFactoryCounter();
});

describe('GET /api/search — over-length queries are rejected', () => {
  it('400s a query longer than the documented maximum', async () => {
    const tooLong = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1);

    const result = await search({ q: tooLong });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('400s a very long query rather than timing out on it', async () => {
    const result = await search({ q: 'x'.repeat(5_000) });

    expect(result.status).toBe(400);
  });

  it('accepts a query of exactly the maximum length', async () => {
    const result = await search({ q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH) });

    expect(result.status).toBe(200);
  });

  it('rejects rather than truncates — the page agrees with the API', () => {
    const tooLong = 'b'.repeat(MAX_SEARCH_QUERY_LENGTH + 1);
    const input = normalizeSearchInput(tooLong);

    expect(input.ok).toBe(false);
    if (input.ok === false) {
      expect(input.error).toContain(String(MAX_SEARCH_QUERY_LENGTH));
    }
    expect(normalizeSearchInput('a'.repeat(MAX_SEARCH_QUERY_LENGTH)).ok).toBe(true);
  });
});

describe('GET /api/search — an empty query is a 200, not a 500', () => {
  it.each([
    ['a missing q', undefined],
    ['an empty q', ''],
    ['whitespace', '   '],
  ])('returns an empty result set for %s', async (_label, q) => {
    await makeStory({ title: 'Something to find', publishedAt: hoursAgo(1) });

    const result = await search(q === undefined ? {} : { q });

    expect(result.status).toBe(200);
    const data = expectOk(result);
    expect(data.items).toEqual([]);
    expect(data.terms).toEqual([]);
    expect(data.nextCursor).toBeNull();
  });
});

describe('GET /api/search — invalid pagination is a 400', () => {
  it.each([
    ['zero', '0'],
    ['above the maximum', String(MAX_PAGE_SIZE + 1)],
    ['non-numeric', 'many'],
  ])('rejects a %s limit', async (_label, limit) => {
    const result = await search({ q: 'anything', limit });

    expect(result.status).toBe(400);
  });
});

describe('GET /api/search — the happy path', () => {
  it('returns ranked results with highlighted, plain-text snippets', async () => {
    const author = await makeUser();
    await makeStory({
      authorId: author.id,
      title: 'Harbour lights',
      publishedAt: hoursAgo(5),
    });
    await makeStory({
      authorId: author.id,
      title: 'An evening walk',
      bodyHtml: '<p>We watched the harbour empty as the tide went out.</p>',
      publishedAt: hoursAgo(5),
    });

    const result = await search({ q: 'harbour' });

    expect(result.status).toBe(200);
    const data = expectOk(result);
    expect(data.query).toBe('harbour');
    expect(data.terms).toEqual(['harbour']);
    expect(data.items.map((item) => item.story.title)).toEqual([
      'Harbour lights',
      'An evening walk',
    ]);

    const highlighted = data.items[1]?.snippet.filter((part) => part.highlight) ?? [];
    expect(highlighted.map((part) => part.text.toLowerCase())).toEqual(['harbour']);
  });

  it('never returns a draft', async () => {
    await makeStory({ title: 'Draft about penguins', status: 'DRAFT' });

    const result = await search({ q: 'penguins' });

    expect(expectOk(result).items).toEqual([]);
  });

  it('is paginated with an enforced limit', async () => {
    const author = await makeUser();
    for (let i = 0; i < 4; i += 1) {
      await makeStory({
        authorId: author.id,
        title: `Herons ${i}`,
        publishedAt: hoursAgo(i + 1),
      });
    }

    const first = await search({ q: 'herons', limit: 2 });
    const firstData = expectOk(first);
    expect(firstData.items).toHaveLength(2);
    expect(firstData.nextCursor).not.toBeNull();

    const second = await search({
      q: 'herons',
      limit: 2,
      cursor: firstData.nextCursor ?? undefined,
    });
    const secondData = expectOk(second);
    expect(secondData.items.map((item) => item.story.title)).toEqual(['Herons 2', 'Herons 3']);
    expect(secondData.nextCursor).toBeNull();
  });

  it('emits no HTML string anywhere in the envelope for a story full of markup', async () => {
    await makeStory({
      title: 'Markup heavy',
      bodyHtml:
        '<p>A <strong>bold</strong> claim about <em>otters</em> and <a href="https://example.com">links</a>.</p>',
      publishedAt: hoursAgo(1),
    });

    const result = await search({ q: 'otters' });
    const data = expectOk(result);
    const snippetOnly = JSON.stringify(data.items.map((item) => item.snippet));

    expect(data.items).toHaveLength(1);
    expect(snippetOnly).not.toContain('<strong>');
    expect(snippetOnly).not.toContain('<a ');
    expect(snippetOnly).not.toContain('href');
  });
});
