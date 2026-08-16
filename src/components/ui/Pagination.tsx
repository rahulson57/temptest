import Link from 'next/link';
import { cn } from '@/lib/cn';

export type PaginationProps = {
  /** Cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
  /** Path the links point at, e.g. "/" or "/tag/design". */
  basePath: string;
  /** Query params to preserve across pages (excluding the cursor). */
  params?: Record<string, string | undefined>;
  /** Cursor of the page currently shown, so "Newer" can go back one step. */
  prevCursor?: string | null;
  className?: string;
  label?: string;
};

/**
 * Cursor pagination control.
 *
 * Renders real <a> links (not buttons) so pages are shareable, crawlable and
 * work without JavaScript. Cursor pagination has no page numbers by design —
 * see src/lib/pagination.ts for why offsets are not used.
 */
export function Pagination({
  nextCursor,
  basePath,
  params,
  prevCursor,
  className,
  label = 'Pagination',
}: PaginationProps) {
  if (!nextCursor && !prevCursor) return null;

  const linkClass =
    'inline-flex h-10 items-center rounded-full border border-border px-4 text-sm ' +
    'text-ink transition-colors hover:bg-surface';

  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-3 py-8', className)}>
      <div>
        {prevCursor ? (
          <Link href={buildHref(basePath, params, prevCursor)} rel="prev" className={linkClass}>
            <span aria-hidden="true">←</span> Newer
          </Link>
        ) : null}
      </div>
      <div>
        {nextCursor ? (
          <Link href={buildHref(basePath, params, nextCursor)} rel="next" className={linkClass}>
            Older <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className="text-sm text-ink-subtle">You&rsquo;re all caught up</span>
        )}
      </div>
    </nav>
  );
}

function buildHref(
  basePath: string,
  params: Record<string, string | undefined> | undefined,
  cursor: string,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== '' && key !== 'cursor') search.set(key, value);
  }
  search.set('cursor', cursor);
  return `${basePath}?${search.toString()}`;
}

export default Pagination;
