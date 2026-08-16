import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <Container width="reading" className="py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-ink-subtle">404</p>
      <h1 className="mt-3 font-serif text-3xl font-bold text-ink sm:text-4xl">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-4 leading-reading text-ink-muted">
        The story may have been unpublished, or the link may be wrong.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <ButtonLink href="/">Back home</ButtonLink>
        <ButtonLink href="/explore" variant="secondary">
          Explore stories
        </ButtonLink>
      </div>
    </Container>
  );
}
