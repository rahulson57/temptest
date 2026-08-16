import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ContainerProps = {
  children: ReactNode;
  /** `reading` = ~65ch story measure. `wide` = lists and grids. */
  width?: 'reading' | 'wide';
  as?: ElementType;
  className?: string;
};

/**
 * Horizontal page gutter + max width.
 *
 * Two widths only. Every page picks one, so the reading column stays exactly
 * as wide on a story page as on a draft preview.
 */
export function Container({
  children,
  width = 'wide',
  as: Tag = 'div',
  className,
}: ContainerProps) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full px-5 sm:px-6',
        width === 'reading' ? 'max-w-measure' : 'max-w-5xl',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export default Container;
