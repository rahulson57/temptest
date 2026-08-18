import Link from 'next/link';
import { cn } from '@/lib/cn';

export type FeedTab = 'for-you' | 'latest' | 'trending';

export type FeedTabsProps = {
  active: FeedTab;
  /** `for-you` is only offered to a signed-in reader. */
  showForYou: boolean;
  className?: string;
};

const LABELS: Record<FeedTab, string> = {
  'for-you': 'For you',
  latest: 'Latest',
  trending: 'Trending',
};

/**
 * The home-feed tab bar.
 *
 * Real <a> links, not buttons: each tab is a distinct, shareable, crawlable URL
 * (`/?tab=trending`), the whole point of server-rendering the feed. `aria-current`
 * rather than colour alone marks the active tab, and the cursor is deliberately
 * dropped when switching tabs — a cursor from Latest means nothing in Trending.
 */
export function FeedTabs({ active, showForYou, className }: FeedTabsProps) {
  const tabs: FeedTab[] = showForYou ? ['for-you', 'latest', 'trending'] : ['latest', 'trending'];

  return (
    <nav aria-label="Feed" className={cn('border-b border-border', className)}>
      <ul className="-mb-px flex items-center gap-6">
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <li key={tab}>
              <Link
                href={hrefFor(tab)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center border-b-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  isActive
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** `latest` is the canonical bare `/` so the home URL stays clean. */
function hrefFor(tab: FeedTab): string {
  return tab === 'latest' ? '/' : `/?tab=${tab}`;
}

export default FeedTabs;
