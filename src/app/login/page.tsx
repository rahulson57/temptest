import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/account/LoginForm';
import { Container } from '@/components/layout/Container';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Quill.',
};

/**
 * /login
 *
 * Middleware sends signed-out visitors here with `?next=<where they wanted to
 * go>`; the form reads it and returns them there afterwards (only same-origin
 * paths — see safeNextPath). Already signed in → home.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');

  return (
    <Container width="reading" className="py-16">
      <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-3 text-ink-muted">Sign in to keep reading and writing.</p>

      <div className="mt-10">
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading the form…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </Container>
  );
}
