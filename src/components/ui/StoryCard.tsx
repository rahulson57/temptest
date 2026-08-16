import Link from 'next/link';
import { Avatar } from './Avatar';
import { TagList } from './Tag';
import { cn } from '@/lib/cn';
import { formatReadingTime } from '@/lib/readingTime';
import type { StorySummary } from '@/lib/types';

export type StoryCardProps = {
  story: StorySummary;
  /** `compact` drops the cover image — used in sidebars and reading lists. */
  variant?: 'default' | 'compact';
  className?: string;
};

/**
 * The canonical story preview, shared by the feed, tag pages, profiles and the
 * reading list. Verticals should reuse this rather than restyling a card.
 *
 * The whole card is NOT one big <a>: the title links to the story and the
 * author links to the profile, so keyboard users get two meaningful stops
 * instead of one ambiguous one.
 */
export function StoryCard({ story, variant = 'default', className }: StoryCardProps) {
  const showCover = variant === 'default' && Boolean(story.coverImageUrl);

  return (
    <article
      className={cn(
        'group flex gap-6 border-b border-border py-8 first:pt-0 last:border-b-0',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Avatar name={story.author.displayName} src={story.author.avatarUrl} size="xs" />
          <Link
            href={`/@${story.author.handle}`}
            className="font-medium text-ink hover:underline"
          >
            {story.author.displayName}
          </Link>
          {story.publishedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={story.publishedAt}>{formatDate(story.publishedAt)}</time>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span className="rounded bg-surface px-1.5 py-0.5 text-xs uppercase tracking-wide">
                Draft
              </span>
            </>
          )}
        </div>

        <h2 className="mt-3 font-serif text-xl font-bold leading-snug text-ink sm:text-2xl">
          <Link href={`/stories/${story.slug}`} className="hover:underline">
            {story.title}
          </Link>
        </h2>

        {story.subtitle || story.excerpt ? (
          <p className="mt-2 line-clamp-2 text-ink-muted">{story.subtitle || story.excerpt}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-subtle">
          <span>{formatReadingTime(story.readingTimeMinutes)}</span>
          {story.clapCount > 0 ? (
            <span>
              {story.clapCount} {story.clapCount === 1 ? 'clap' : 'claps'}
            </span>
          ) : null}
          {story.commentCount > 0 ? (
            <span>
              {story.commentCount} {story.commentCount === 1 ? 'response' : 'responses'}
            </span>
          ) : null}
          <TagList tags={story.tags} />
        </div>
      </div>

      {showCover && story.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={story.coverImageUrl}
          alt=""
          aria-hidden="true"
          className="hidden h-28 w-28 shrink-0 rounded-card object-cover sm:block sm:h-32 sm:w-48"
        />
      ) : null}
    </article>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default StoryCard;
