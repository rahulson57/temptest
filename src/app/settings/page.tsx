import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileSettingsForm } from '@/components/account/ProfileSettingsForm';
import { SignOutButton } from '@/components/account/SignOutButton';
import { Container } from '@/components/layout/Container';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Edit your Quill profile.',
};

/**
 * /settings — edit your own profile.
 *
 * Middleware already bounces signed-out visitors, but this checks again:
 * middleware is a first gate, not the security boundary (docs/STACK.md §4). It
 * can be bypassed by anything that does not traverse it, and a page that trusts
 * it is one routing change away from leaking.
 *
 * There is no "whose profile" question to answer here — the editable user IS the
 * session user, and the PATCH endpoint resolves its target the same way. That is
 * why editing someone else is not a code path with a guard, it is a code path
 * that does not exist.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fsettings');

  return (
    <Container width="reading" className="py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <Link href={`/u/${user.handle}`} className="text-sm text-ink-muted underline hover:text-ink">
          View your profile
        </Link>
      </div>

      <p className="mt-3 text-ink-muted">
        Signed in as <span className="text-ink">{user.email}</span>
      </p>

      <div className="mt-10">
        <ProfileSettingsForm user={user} />
      </div>

      <hr className="my-12 border-border" />

      <section aria-labelledby="session-heading" className="flex flex-col items-start gap-3">
        <h2 id="session-heading" className="font-serif text-lg font-semibold text-ink">
          Session
        </h2>
        <p className="text-sm text-ink-muted">
          Signing out clears your session cookie on this device.
        </p>
        <SignOutButton />
      </section>
    </Container>
  );
}
