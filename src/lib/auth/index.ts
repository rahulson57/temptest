/**
 * Auth barrel — the import surface for every vertical.
 *
 *   import { requireUser, hashPassword, createSession } from '@/lib/auth';
 *
 * NOTE: this barrel pulls in bcryptjs and Prisma and is therefore NODE-ONLY.
 * `src/middleware.ts` must import from '@/lib/auth/session-token' instead.
 */
export { BCRYPT_COST, hashPassword, verifyPassword } from './password';
export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  destroySession,
  readSession,
  signSessionToken,
  verifySessionToken,
} from './session';
export type { SessionPayload } from './session-token';
export { PUBLIC_USER_SELECT, assertOwner, getCurrentUser, requireUser, toPublicUser } from './user';
