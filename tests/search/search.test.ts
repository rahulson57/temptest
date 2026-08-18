import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { makeStory, makeUser, resetFactoryCounter } from '../helpers/factories';
import { searchStories } from '@/server/search/query';
import { snippetText } from '@/server/search/highlight';
import {
  BODY_WEIGHT,
  SUBTITLE_WEIGHT,
  TITLE_WEIGHT,
  scoreStory,
  tokenizeQuery,
} from '@/server/search/tokenize';
import { pageParams } from '@/lib/pagination';

/**
 * SEARCH — behaviour, ranking, and the two things that make it safe:
 * HTML is stripped before matching, and drafts are invisible.
 */

const NOW = new Date('2025-03-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const titles = (page: { items: { story: { title: string } }[] }) =>
  page.items.map((item) => item.story.title);

beforeEach(() => {
  resetFactoryCounter();
});

describe('tokenizeQuery', () => {
  it('lowercases, splits on non-alphanumerics and drops duplicates', () => {
    expect(tokenizeQuery('Design-Systems, 2024!')).toEqual(['design', 'systems', '2024']);
    expect(tokenizeQuery('cats CATS Cats')).toEqual(['cats']);
  });

  it('returns no terms for empty, whitespace or punctuation-only input', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('    ')).toEqual([]);
    expect(tokenizeQuery('!!! ??? ...')).toEqual([]);
    expect(tokenizeQuery(null)).toEqual([]);
    expect(tokenizeQuery(undefined)).toEqual([]);
  });

  it('caps the number of terms it will score', () => {
    const many = tokenizeQuery('a b c d e f g h i j k l m n o p');
    expect(many.length).toBeLessThanOrEqual(8);
    expect(many.length).toBeGreaterThan(0);
  });
});

describe('scoreStory — field weights', () => {
  it('ranks title above subtitle above body for the same term', () => {
    const inTitle = scoreStory({ title: 'octopus', subtitle: null, body: 'x' }, ['octopus']);
    const inSubtitle = scoreStory({ title: 'x', subtitle: 'octopus', body: 'y' }, ['octopus']);
    const inBody = scoreStory({ title: 'x', subtitle: null, body: 'octopus' }, ['octopus']);

    expect(inTitle.score).toBe(TITLE_WEIGHT);
    expect(inSubtitle.score).toBe(SUBTITLE_WEIGHT);
    expect(inBody.score).toBe(BODY_WEIGHT);
    expect(inTitle.score).toBeGreaterThan(inSubtitle.score);
    expect(inSubtitle.score).toBeGreaterThan(inBody.score);
  });

  it('counts a term once per field, so keyword stuffing cannot outrank a title', () => {
    const stuffed = scoreStory(
      { title: 'x', subtitle: null, body: 'seo seo seo seo seo seo seo seo seo seo' },
      ['seo'],
    );
    const genuine = scoreStory({ title: 'seo', subtitle: null, body: '' }, ['seo']);

    expect(stuffed.score).toBe(BODY_WEIGHT);
    expect(genuine.score).toBeGreaterThan(stuffed.score);
  });

  it('rewards matching more distinct terms', () => {
    const both = scoreStory({ title: 'x', subtitle: null, body: 'alpha beta' }, ['alpha', 'beta']);
    const one = scoreStory({ title: 'x', subtitle: null, body: 'alpha' }, ['alpha', 'beta']);

    expect(both.score).toBeGreaterThan(one.score);
    expect(both.matchedTerms).toEqual(['alpha', 'beta']);
  });

  it('reports the strongest matching field', () => {
    expect(scoreStory({ title: 'q', subtitle: 'q', body: 'q' }, ['q']).matchedIn).toBe('title');
    expect(scoreStory({ title: 'x', subtitle: 'q', body: 'q' }, ['q']).matchedIn).toBe('subtitle');
    expect(scoreStory({ title: 'x', subtitle: null, body: 'q' }, ['q']).matchedIn).toBe('body');
    expect(scoreStory({ title: 'x', subtitle: null, body: 'y' }, ['q']).matchedIn).toBeNull();
  });
});

describe('searchStories — the happy path and its ranking', () => {
  it('ranks a title hit above a subtitle hit above a body hit', async () => {
    const author = await makeUser();
    // Identical publish times, so ONLY relevance can decide the order.
    await makeStory({
      authorId: author.id,
      title: 'A study of lighthouses',
      publishedAt: hoursAgo(5),
    });
    await makeStory({
      authorId: author.id,
      title: 'Coastal notes',
      subtitle: 'On lighthouses and their keepers',
      publishedAt: hoursAgo(5),
    });
    await makeStory({
      authorId: author.id,
      title: 'Sailing home',
      bodyHtml: '<p>We passed three lighthouses before dawn.</p>',
      publishedAt: hoursAgo(5),
    });

    const page = await searchStories('lighthouses', pageParams(), testPrisma);

    expect(titles(page)).toEqual(['A study of lighthouses', 'Coastal notes', 'Sailing home']);
    expect(page.items.map((item) => item.matchedIn)).toEqual(['title', 'subtitle', 'body']);
    // Scores are strictly decreasing, not merely ordered by luck.
    const scores = page.items.map((item) => item.score);
    expect(scores[0]).toBeGreaterThan(scores[1] as number);
    expect(scores[1]).toBeGreaterThan(scores[2] as number);
  });

  it('is case-insensitive in both directions', async () => {
    await makeStory({ title: 'The MIGRATION of Terns', publishedAt: hoursAgo(1) });

    const lower = await searchStories('migration', pageParams(), testPrisma);
    const upper = await searchStories('MIGRATION', pageParams(), testPrisma);
    const mixed = await searchStories('MiGrAtIoN', pageParams(), testPrisma);

    expect(titles(lower)).toEqual(['The MIGRATION of Terns']);
    expect(titles(upper)).toEqual(titles(lower));
    expect(titles(mixed)).toEqual(titles(lower));
  });

  it('matches a multi-word query against any field and prefers more matches', async () => {
    const author = await makeUser();
    await makeStory({
      authorId: author.id,
      title: 'Coffee',
      bodyHtml: '<p>Nothing about tea here.</p>',
      publishedAt: hoursAgo(5),
    });
    await makeStory({
      authorId: author.id,
      title: 'Coffee and tea',
      publishedAt: hoursAgo(5),
    });

    const page = await searchStories('coffee tea', pageParams(), testPrisma);

    expect(titles(page)).toEqual(['Coffee and tea', 'Coffee']);
  });

  it('returns nothing for a query no story matches', async () => {
    await makeStory({ title: 'Bread', publishedAt: hoursAgo(1) });

    const page = await searchStories('quasar', pageParams(), testPrisma);

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.terms).toEqual(['quasar']);
  });

  it('paginates results with a stable cursor', async () => {
    const author = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      await makeStory({
        authorId: author.id,
        title: `Puffins ${i}`,
        publishedAt: hoursAgo(i + 1),
      });
    }

    const first = await searchStories('puffins', pageParams({ limit: 2 }), testPrisma);
    expect(titles(first)).toEqual(['Puffins 0', 'Puffins 1']);
    expect(first.nextCursor).not.toBeNull();

    const second = await searchStories(
      'puffins',
      pageParams({ limit: 2, cursor: first.nextCursor }),
      testPrisma,
    );
    expect(titles(second)).toEqual(['Puffins 2', 'Puffins 3']);

    const third = await searchStories(
      'puffins',
      pageParams({ limit: 2, cursor: second.nextCursor }),
      testPrisma,
    );
    expect(titles(third)).toEqual(['Puffins 4']);
    expect(third.nextCursor).toBeNull();
  });
});

describe('searchStories — the empty query is a prompt, not an error', () => {
  it.each([
    ['empty string', ''],
    ['spaces', '   '],
    ['a tab and a newline', '\t\n'],
    ['punctuation only', '---'],
  ])('returns an empty page for %s without throwing', async (_label, query) => {
    await makeStory({ title: 'Something published', publishedAt: hoursAgo(1) });

    const page = await searchStories(query, pageParams(), testPrisma);

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.terms).toEqual([]);
  });

  it('does not return the whole archive for an empty query', async () => {
    const author = await makeUser();
    for (let i = 0; i < 3; i += 1) {
      await makeStory({ authorId: author.id, publishedAt: hoursAgo(i + 1) });
    }

    const page = await searchStories('', pageParams(), testPrisma);

    expect(page.items).toHaveLength(0);
  });
});

describe('searchStories — drafts are invisible', () => {
  it('never returns a DRAFT, even on an exact title match', async () => {
    const author = await makeUser();
    await makeStory({
      authorId: author.id,
      title: 'Unreleased manifesto',
      subtitle: 'manifesto',
      bodyHtml: '<p>manifesto manifesto</p>',
      status: 'DRAFT',
    });
    await makeStory({
      authorId: author.id,
      title: 'Published manifesto',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('manifesto', pageParams(), testPrisma);

    expect(titles(page)).toEqual(['Published manifesto']);
    expect(titles(page)).not.toContain('Unreleased manifesto');
  });

  it('returns nothing when the only match is a draft', async () => {
    await makeStory({ title: 'Secret project codename Osprey', status: 'DRAFT' });

    const page = await searchStories('osprey', pageParams(), testPrisma);

    expect(page.items).toEqual([]);
  });
});

describe('searchStories — HTML is stripped before matching', () => {
  it('does not match markup that only exists in the stored HTML', async () => {
    await makeStory({
      title: 'A linked story',
      bodyHtml: '<p>See <a href="https://example.com">this</a> and <strong>that</strong>.</p>',
      publishedAt: hoursAgo(1),
    });

    // "href", "strong" and "https" appear in bodyHtml but not in the prose.
    for (const term of ['href', 'strong', 'https']) {
      const page = await searchStories(term, pageParams(), testPrisma);
      expect(titles(page)).toEqual([]);
    }

    // ...while the actual visible words still match.
    const real = await searchStories('linked', pageParams(), testPrisma);
    expect(titles(real)).toEqual(['A linked story']);
  });

  it('matches text that spans inline markup', async () => {
    await makeStory({
      title: 'Emphasis',
      bodyHtml: '<p>The <em>quiet</em> harbour at dusk.</p>',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('quiet', pageParams(), testPrisma);

    expect(titles(page)).toEqual(['Emphasis']);
    expect(page.items[0]?.matchedIn).toBe('body');
  });
});

describe('searchStories — snippets are plain text, always', () => {
  it('highlights the matched term inside the snippet', async () => {
    await makeStory({
      title: 'Notes from the field',
      bodyHtml:
        '<p>The estuary was full of waders that morning, and the light was extraordinary.</p>',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('estuary', pageParams(), testPrisma);
    const snippet = page.items[0]?.snippet ?? [];

    expect(snippet.length).toBeGreaterThan(0);
    const highlighted = snippet.filter((part) => part.highlight).map((part) => part.text);
    expect(highlighted).toEqual(['estuary']);
    expect(snippetText(snippet)).toContain('estuary was full of waders');
  });

  it('carries NO html: a scripted story body cannot inject markup into a result', async () => {
    // sanitizeStoryHtml strips <script> on write; this asserts the SEARCH layer
    // is independently safe, using markup the sanitizer does allow through.
    await makeStory({
      title: 'Payload story',
      bodyHtml:
        '<p>Totally normal prose about <a href="javascript:alert(1)">danger</a> and more.</p>',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('danger', pageParams(), testPrisma);
    const snippet = page.items[0]?.snippet ?? [];
    const text = snippetText(snippet);

    expect(snippet.length).toBeGreaterThan(0);
    // Segments are plain text — no tags, no attributes, nothing to interpret.
    expect(text).not.toContain('<');
    expect(text).not.toContain('javascript:');
    expect(text).toContain('danger');
    // And every segment is a string, not an HTML blob to be injected.
    expect(snippet.every((part) => typeof part.text === 'string')).toBe(true);
  });

  it('escapes nothing because it produces nothing to escape, even for angle brackets in prose', async () => {
    await makeStory({
      title: 'Comparisons',
      bodyHtml: '<p>When 3 &lt; 5 the widget breaks, oddly enough.</p>',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('widget', pageParams(), testPrisma);
    const text = snippetText(page.items[0]?.snippet ?? []);

    // The decoded "<" is a literal character in a text node, not a tag opener.
    expect(text).toContain('3 < 5 the widget breaks');
  });

  it('quotes the title when the title is what matched', async () => {
    await makeStory({
      title: 'The Wandering Albatross',
      bodyHtml: '<p>Unrelated body text about mountains.</p>',
      publishedAt: hoursAgo(1),
    });

    const page = await searchStories('albatross', pageParams(), testPrisma);

    expect(page.items[0]?.matchedIn).toBe('title');
    expect(snippetText(page.items[0]?.snippet ?? [])).toBe('The Wandering Albatross');
  });
});

describe('searchStories — engagement counts are hydrated', () => {
  it('returns clap and comment counts on each result', async () => {
    const reader = await makeUser();
    const story = await makeStory({ title: 'Popular reading', publishedAt: hoursAgo(1) });
    await testPrisma.clap.create({ data: { userId: reader.id, storyId: story.id, count: 9 } });
    await testPrisma.comment.create({
      data: { id: 'sc1', storyId: story.id, authorId: reader.id, bodyText: 'Yes' },
    });

    const page = await searchStories('popular', pageParams(), testPrisma);

    expect(page.items[0]?.story.clapCount).toBe(9);
    expect(page.items[0]?.story.commentCount).toBe(1);
  });
});
