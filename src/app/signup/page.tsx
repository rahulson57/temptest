import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/account/SignupForm';
import { Container } from '@/components/layout/Container';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Join Quill to publish your writing and build a reading list.',
};

/**
 * /signup
 *
 * Already signed in? Go home. Rendering a create-account form to someone who
 * has an account is a dead end — the only thing they can do with it is create a
 * second one by accident.
 *
 * The form is a client component (it owns field state) wrapped in <Suspense>
 * because it reads useSearchParams for the post-signup `next` destination.
 */
export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');

  return (
    <Container width="reading" className="py-16">
      <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mt-3 text-ink-muted">
        Publish your writing, follow people worth reading, and keep a list of what to come back to.
      </p>

      <div className="mt-10">
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading the form…</p>}>
          <SignupForm />
        </Suspense>
      </div>
    </Container>
  );
}
