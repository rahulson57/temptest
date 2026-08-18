import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchForm } from '@/components/feed/SearchForm';
import { SearchResults } from '@/components/feed/SearchResults';
import { pageParams } from '@/lib/pagination';
import { normalizeSearchInput, searchStories } from '@/server/search/query';
import { MAX_SEARCH_QUERY_LENGTH } from '@/server/search/tokenize';

/**
 * SEARCH — /search?q=
 *
 * Server-rendered, GET-based: every search is a shareable URL and the page
 * works with JavaScript off.
 *
 * THREE STATES, all of them designed:
 *  - no query          → a prompt, not an error and not an empty list
 *  - over-long query   → an inline message tied to the input (the API returns
 *                        400 for the same input; the page explains instead of
 *                        blowing up in a reader's face)
 *  - query, no matches → the same "nothing here" panel every other list uses
 *
 * Snippets are rendered from plain-text segments, never HTML — see
 * src/components/feed/HighlightedSnippet.tsx.
 */

export const metadata: Metadata = {
  title: 'Search — Quill',
  description: 'Search published stories on Quill.',
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string; cursor?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: rawQuery, cursor } = await searchParams;
  const input = normalizeSearchInput(rawQuery);

  // Over-long: show the box with the error attached and stop. No query runs.
  if (!input.ok) {
    return (
      <Container className="py-10">
        <Header />
        <SearchForm
          defaultQuery={input.q.slice(0, MAX_SEARCH_QUERY_LENGTH)}
          maxLength={MAX_SEARCH_QUERY_LENGTH}
          error={input.error}
        />
      </Container>
    );
  }

  const results = await searchStories(input.q, pageParams({ cursor }));
  const hasQuery = results.terms.length > 0;

  return (
    <Container className="py-10">
      <Header />
      <SearchForm defaultQuery={input.q} maxLength={MAX_SEARCH_QUERY_LENGTH} />

      {!hasQuery ? (
        <div className="py-10">
          <EmptyState
            title="What are you looking for?"
            description="Search published stories by title, standfirst or body text."
          />
        </div>
      ) : results.items.length === 0 ? (
        <div className="py-10">
          <EmptyState
            title={`No stories match “${input.q}”`}
            description="Try fewer words, or a different spelling."
          />
        </div>
      ) : (
        <>
          <p aria-live="polite" className="mt-8 text-sm text-ink-muted">
            Showing results for <span className="font-medium text-ink">{input.q}</span>
          </p>
          <SearchResults results={results.items} />
          <Pagination
            nextCursor={results.nextCursor}
            basePath="/search"
            params={{ q: input.q }}
            label="Search pagination"
          />
        </>
      )}
    </Container>
  );
}

function Header() {
  return (
    <h1 className="mb-6 font-serif text-3xl font-bold leading-tight text-ink sm:text-4xl">
      Search
    </h1>
  );
}
