import type { ApiResponse } from '@/lib/api';

/**
 * The one fetch path every social control uses.
 *
 * These four buttons are the only place in the product where a SIGNED-OUT
 * visitor can click something that requires a session. Their props (frozen in
 * src/lib/types.ts) deliberately do not carry viewer identity — the Reading and
 * Discovery verticals render them without knowing whether anyone is signed in.
 *
 * So the sign-in state is DISCOVERED, not passed: fire the request, and if the
 * server says 401, send the visitor to /login with a `next` that brings them
 * back to the story they were reading. That keeps one source of truth (the
 * session cookie) instead of a prop that can be stale on a cached page.
 */

export type SocialRequestResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

const GENERIC_ERROR = 'That didn’t work. Please try again.';

/** POST/DELETE a social endpoint and narrow the envelope. Never throws. */
export async function socialRequest<T>(
  path: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<SocialRequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Offline, aborted, DNS — indistinguishable to us and equally unactionable.
    return { kind: 'error', message: GENERIC_ERROR };
  }

  if (response.status === 401) return { kind: 'unauthenticated' };

  let envelope: ApiResponse<T> | null = null;
  try {
    envelope = (await response.json()) as ApiResponse<T>;
  } catch {
    envelope = null;
  }

  if (envelope && envelope.ok) return { kind: 'ok', data: envelope.data };
  return {
    kind: 'error',
    message: envelope && !envelope.ok ? envelope.error.message : GENERIC_ERROR,
  };
}

/**
 * Send a signed-out visitor to the login form, remembering where they were.
 *
 * `location.assign` rather than next/navigation's router.push: this is an auth
 * boundary, and a full navigation guarantees the server re-resolves the session
 * for the page they land back on instead of reusing a client cache that still
 * believes they are signed out.
 */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}
