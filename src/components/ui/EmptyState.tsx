import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional call to action — a <ButtonLink> or <Button>. */
  action?: ReactNode;
  className?: string;
};

/**
 * The "nothing here yet" panel.
 *
 * Every list surface uses this instead of rendering blank space, so an empty
 * feed reads as a state rather than a failure.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-border',
        'px-6 py-14 text-center',
        className,
      )}
    >
      <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
