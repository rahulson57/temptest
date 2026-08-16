import { Container } from '@/components/layout/Container';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * PLACEHOLDER — ownership transfers to the DISCOVERY vertical.
 *
 * Discovery replaces this file wholesale with the real personalized/latest
 * feed. It exists now only so `npm run build` and the E2E smoke check have a
 * route at / that returns 200. Do not build feed logic on top of it.
 */
export default function HomePage() {
  return (
    <Container className="py-16">
      <div className="prose-measure text-center">
        <h1 className="font-serif text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Words worth your attention
        </h1>
        <p className="mt-5 text-lg leading-reading text-ink-muted">
          Quill is a quiet place to publish long-form writing and to find things worth reading.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <ButtonLink href="/signup" size="lg">
            Start writing
          </ButtonLink>
          <ButtonLink href="/explore" size="lg" variant="secondary">
            Explore stories
          </ButtonLink>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-2xl">
        <EmptyState
          title="The feed is on its way"
          description="This placeholder ships with the foundations. The Discovery vertical replaces it with the real feed."
        />
      </div>
    </Container>
  );
}
