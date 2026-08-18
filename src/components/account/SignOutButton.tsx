'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Sign out.
 *
 * A real <button> firing a POST, not a link: a GET /logout can be triggered by
 * any third-party page embedding <img src="…/logout">, which signs readers out
 * mid-article for fun. After the request a FULL navigation to "/" makes the
 * server re-resolve the (now absent) session, so the header cannot keep showing
 * a signed-in shell from a client cache.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // The cookie may or may not be gone; a reload resolves the truth either way.
    }
    window.location.assign('/');
  }

  return (
    <Button type="button" variant="secondary" onClick={signOut} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}

export default SignOutButton;
