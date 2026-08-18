import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { sessionTokenFor, type SessionUserLike } from '../helpers/auth';
import { createCookieStoreMock } from '../helpers/request';

/**
 * Shared session plumbing for the authoring route tests.
 *
 * WHY EVERY TEST FILE MOCKS TWO MODULES
 *
 * 1. `next/headers` — route handlers resolve the viewer through
 *    getCurrentUser() → readSession() → cookies(). `cookies()` reads
 *    request-scoped AsyncLocalStorage that only exists inside a real Next
 *    request, so calling a handler directly throws without this double. The
 *    double holds a REAL signed JWT (see sessionTokenFor), so token signing,
 *    verification and expiry are all still exercised for real — only the
 *    transport is stubbed.
 *
 * 2. `@/lib/db` — the handler's prisma singleton resolves DATABASE_URL, which
 *    points at the DEV database. The suite asserts through `testPrisma`, which
 *    is bound to the per-run TEST_DATABASE_URL. Without the mock the handler
 *    would write one file while the assertions read another, and the whole
 *    suite would fail as mystifying "0 rows". Both sides are the same real
 *    PrismaClient class against the same real schema; only the URL is pinned.
 *
 * vi.mock is hoisted and per-file, so the two factories have to be repeated in
 * each test file. What can be shared lives here.
 */

/** The cookie jar the `next/headers` double serves. One per test file. */
export const cookieStore = createCookieStoreMock();

/** Put a real signed session for `user` in the jar. */
export async function signIn(user: SessionUserLike): Promise<void> {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

/** Empty the jar — the next request is signed out. */
export function signOut(): void {
  cookieStore.clear();
}

/** A body that always fails `createStorySchema`: `.strict()` rejects it. */
export const UNKNOWN_FIELD_BODY = { title: 'Fine title', authorId: 'someone-else' };
