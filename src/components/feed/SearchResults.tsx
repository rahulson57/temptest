import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { TagList } from '@/components/ui/Tag';
import { formatReadingTime } from '@/lib/readingTime';
import type { SearchResult } from '@/server/search/query';
import { HighlightedSnippet } from './HighlightedSnippet';

export type SearchResultsProps = {
  results: SearchResult[];
};

const MATCHED_IN_LABEL: Record<string, string> = {
  title: 'Matched in the title',
  subtitle: 'Matched in the standfirst',
  body: 'Matched in the story',
};

/**
 * The search result list.
 *
 * Deliberately NOT <StoryCard>: a search result's job is to show WHY it
 * matched, so the excerpt is replaced by a highlighted snippet drawn from the
 * field that actually hit. Everything else (author line, reading time, tags)
 * mirrors the card so the two read as one system.
 */
export function SearchResults({ results }: SearchResultsProps) {
  return (
    <ul aria-label="Search results">
      {results.map(({ story, snippet, matchedIn }) => (
        <li
          key={story.id}
          className="border-b border-border py-7 first:pt-4 last:border-b-0"
        >
          <article>
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Avatar name={story.author.displayName} src={story.author.avatarUrl} size="xs" />
              <Link
                href={`/u/${story.author.handle}`}
                className="font-medium text-ink hover:underline"
              >
                {story.author.displayName}
              </Link>
              {matchedIn ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-xs text-ink-subtle">{MATCHED_IN_LABEL[matchedIn]}</span>
                </>
              ) : null}
            </div>

            <h2 className="mt-2 font-serif text-xl font-bold leading-snug text-ink">
              <Link href={`/story/${story.slug}`} className="hover:underline">
                {story.title}
              </Link>
            </h2>

            <HighlightedSnippet segments={snippet} className="mt-2 leading-relaxed" />

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-subtle">
              <span>{formatReadingTime(story.readingTimeMinutes)}</span>
              {story.clapCount > 0 ? (
                <span>
                  {story.clapCount} {story.clapCount === 1 ? 'clap' : 'claps'}
                </span>
              ) : null}
              <TagList tags={story.tags} />
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

export default SearchResults;
