import Link from 'next/link';
import { cn } from '@/lib/cn';

export type TagProps = {
  name: string;
  /** When present the tag links to /tag/<slug>; otherwise it renders as a static chip. */
  slug?: string;
  size?: 'sm' | 'md';
  className?: string;
};

const SIZES = {
  sm: 'h-6 px-2.5 text-xs',
  md: 'h-7 px-3 text-sm',
} as const;

/** Topic chip. Links to the tag page when a slug is given. */
export function Tag({ name, slug, size = 'md', className }: TagProps) {
  const classes = cn(
    'inline-flex items-center rounded-full bg-surface text-ink-muted',
    'ring-1 ring-inset ring-border transition-colors',
    SIZES[size],
    className,
  );

  if (!slug) {
    return <span className={classes}>{name}</span>;
  }

  return (
    <Link href={`/tag/${slug}`} className={cn(classes, 'hover:bg-border/60 hover:text-ink')}>
      {name}
    </Link>
  );
}

export type TagListProps = {
  tags: { id?: string; name: string; slug?: string }[];
  size?: 'sm' | 'md';
  className?: string;
};

export function TagList({ tags, size = 'sm', className }: TagListProps) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)}>
      {tags.map((tag) => (
        <li key={tag.id ?? tag.slug ?? tag.name}>
          <Tag name={tag.name} slug={tag.slug} size={size} />
        </li>
      ))}
    </ul>
  );
}

export default Tag;
