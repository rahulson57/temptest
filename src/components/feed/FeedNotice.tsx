import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FeedNoticeProps = {
  children: ReactNode;
  className?: string;
};

/**
 * An inline explanation above a feed — currently one job: telling a signed-in
 * reader that "For you" is showing the global feed because they do not follow
 * anyone yet.
 *
 * It is a real, visible sentence rather than a silent substitution. Quietly
 * serving the global feed under a "For you" heading teaches readers that the
 * tab is broken; saying so, with the fix one link away, teaches them how the
 * product works.
 */
export function FeedNotice({ children, className }: FeedNoticeProps) {
  return (
    <p
      className={cn(
        'mt-4 rounded-card border border-border bg-surface px-4 py-3 text-sm text-ink-muted',
        className,
      )}
    >
      {children}
    </p>
  );
}

export default FeedNotice;
