import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { FeedNotice } from '@/components/feed/FeedNotice';
import { FeedTabs, type FeedTab } from '@/components/feed/FeedTabs';
import { StoryList } from '@/components/feed/StoryList';
import { getCurrentUser } from '@/lib/auth';
import { pageParams } from '@/lib/pagination';
import { globalFeed, personalFeed, trendingFeed, type FeedPage } from '@/server/feed/queries';

/**
 * HOME FEED — server-rendered, so it is crawlable and works without JS.
 *
 * Three tabs, each a distinct URL:
 *   /              → Latest (global, newest first)
 *   /?tab=trending → Trending (see src/server/feed/score.ts for the formula)
 *   /?tab=for-you  → Personalized (signed-in only): stories from authors you
 *                    follow UNION stories carrying tags you follow.
 *
 * Signed-in readers land on "For you"; signed-out readers land on "Latest",
 * because a personalized feed for someone with no follows is just the global
 * feed with a misleading label.
 *
 * When "For you" resolves to nothing (you follow nobody, or nobody you follow
 * has published), it falls back to the global feed AND SAYS SO — see FeedNotice.
 *
 * There is no client-side data fetching here at all: the page is one server
 * render, and paging is plain <a> links carrying a cursor.
 */

export const metadata: Metadata = {
  title: 'Quill — words worth your attention',
  description: 'Read long-form writing from people worth following.',
};

type HomeSearchParams = { tab?: string; cursor?: string };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const { tab, cursor } = await searchParams;
  const viewer = await getCurrentUser();

  const active = resolveTab(tab, Boolean(viewer));
  const params = pageParams({ cursor });

  const feed = await loadFeed(active, viewer?.id ?? null, params);

  return (
    <Container className="py-10">
      <h1 className="sr-only">Stories on Quill</h1>

      {viewer ? null : <Hero />}

      <FeedTabs active={active} showForYou={Boolean(viewer)} className="mt-2" />

      {feed.fallback ? (
        <FeedNotice>
          You don&rsquo;t follow anyone yet, so this is what everyone is reading. Follow a writer
          or a topic and this tab becomes yours — start from{' '}
          <Link href="/?tab=trending" className="font-medium text-ink underline">
            Trending
          </Link>
          .
        </FeedNotice>
      ) : null}

      <StoryList
        stories={feed.items}
        label={LIST_LABEL[active]}
        emptyTitle={EMPTY[active].title}
        emptyDescription={EMPTY[active].description}
        emptyAction={<ButtonLink href="/search">Search stories</ButtonLink>}
      />

      <Pagination
        nextCursor={feed.nextCursor}
        basePath="/"
        params={active === 'latest' ? {} : { tab: active }}
        label="Feed pagination"
      />
    </Container>
  );
}

/** Signed-out readers get one line of context above the feed, not a wall. */
function Hero() {
  return (
    <div className="border-b border-border pb-8">
      <p className="font-serif text-2xl font-bold leading-snug text-ink sm:text-3xl">
        Words worth your attention.
      </p>
      <p className="mt-2 max-w-measure text-ink-muted">
        Quill is a quiet place to publish long-form writing and to find things worth reading.{' '}
        <Link href="/signup" className="font-medium text-ink underline">
          Create an account
        </Link>{' '}
        to follow the writers and topics you care about.
      </p>
    </div>
  );
}

/**
 * `for-you` is only honoured for a signed-in reader; anything unrecognized
 * falls to `latest` rather than 404ing, because a hand-edited query string on
 * the home page should still show the home page.
 */
function resolveTab(raw: string | undefined, signedIn: boolean): FeedTab {
  if (raw === 'trending') return 'trending';
  if (raw === 'for-you') return signedIn ? 'for-you' : 'latest';
  if (raw === 'latest') return 'latest';
  return signedIn ? 'for-you' : 'latest';
}

async function loadFeed(
  tab: FeedTab,
  viewerId: string | null,
  params: ReturnType<typeof pageParams>,
): Promise<FeedPage> {
  if (tab === 'trending') return trendingFeed(params);
  if (tab === 'for-you' && viewerId) return personalFeed(viewerId, params);
  return globalFeed(params);
}

const LIST_LABEL: Record<FeedTab, string> = {
  'for-you': 'Stories for you',
  latest: 'Latest stories',
  trending: 'Trending stories',
};

const EMPTY: Record<FeedTab, { title: string; description: string }> = {
  'for-you': {
    title: 'Nothing new from the people you follow',
    description: 'You are all caught up. Follow another writer or topic to widen your feed.',
  },
  latest: {
    title: 'No stories published yet',
    description: 'Quill is brand new. The first published story shows up here.',
  },
  trending: {
    title: 'Nothing is trending yet',
    description:
      'Trending needs claps and responses from the last week. Check back once readers arrive.',
  },
};
