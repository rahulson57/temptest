import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from './Container';
import type { SessionUser } from '@/lib/types';

export type SiteHeaderProps = {
  /** Resolved by the layout via getCurrentUser(); null when signed out. */
  user?: SessionUser | null;
};

/**
 * Global navigation.
 *
 * Rendered by src/app/layout.tsx, which resolves the viewer. Signed-out and
 * signed-in states are both handled here so no page has to duplicate the logic.
 */
export function SiteHeader({ user }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="font-serif text-xl font-bold tracking-tight text-ink"
            aria-label="Quill — home"
          >
            Quill
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/explore"
              className="rounded-full px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              Explore
            </Link>

            {user ? (
              <>
                <Link
                  href="/reading-list"
                  className="rounded-full px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  Reading list
                </Link>
                <ButtonLink href="/write" size="sm" variant="secondary">
                  Write
                </ButtonLink>
                <Link
                  href={`/@${user.handle}`}
                  className="ml-1 rounded-full"
                  aria-label={`Your profile, ${user.displayName}`}
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  Sign in
                </Link>
                <ButtonLink href="/signup" size="sm">
                  Get started
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </Container>
    </header>
  );
}

export default SiteHeader;
