import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from './session-token';

/**
 * Cookie-bound session management.
 *
 * NODE/ROUTE-HANDLER ONLY — `next/headers` is unavailable in middleware.
 * Middleware should import from ./session-token instead.
 *
 * The Accounts vertical calls createSession() after a successful login/signup
 * and destroySession() on logout. It owns those routes; it must not re-implement
 * the cookie itself.
 */

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from './session-token';
export type { SessionPayload } from './session-token';

/** Mint a session JWT and set it as an httpOnly, SameSite=Lax cookie. */
export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await signSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return token;
}

/** Read and verify the session cookie. Returns null when signed out or expired. */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/** Clear the session cookie. Safe to call when already signed out. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  // Overwrite with an immediately-expiring cookie, then delete: some clients
  // ignore a bare delete when the original was set with different attributes.
  store.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(0));
  store.delete(SESSION_COOKIE_NAME);
}
