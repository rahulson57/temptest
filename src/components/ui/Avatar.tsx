import { cn } from '@/lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
};

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
};

/**
 * Author avatar with an initials fallback.
 *
 * Uses a plain <img>, not next/image: avatars are small, come from arbitrary
 * user-supplied URLs, and are not worth a remotePatterns allowlist per host.
 * The image is decorative — the author's name is always adjacent in the DOM —
 * so alt="" keeps screen readers from announcing it twice.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    'bg-surface font-medium uppercase text-ink-muted ring-1 ring-border',
    SIZES[size],
    className,
  );

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden="true" className={cn(base, 'object-cover')} />
    );
  }

  return (
    <span className={base} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}` || '?';
}

export default Avatar;
