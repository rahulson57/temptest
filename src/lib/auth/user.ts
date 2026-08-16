import { prisma } from '../db';
import { ForbiddenError, UnauthorizedError } from '../errors';
import type { PublicUser, SessionUser } from '../types';
import { readSession } from './session';

/**
 * Viewer resolution for server components and route handlers.
 *
 * getCurrentUser() re-reads the user row rather than trusting the JWT claims:
 * a token minted a week ago may name a user who has since changed their handle
 * or been deleted. The JWT proves identity; the database is the source of truth.
 */

/** Columns that are safe to hand to a client. Excludes passwordHash. */
export const PUBLIC_USER_SELECT = {
  id: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
} as const;

const SESSION_USER_SELECT = { ...PUBLIC_USER_SELECT, email: true } as const;

/** The signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: SESSION_USER_SELECT,
  });

  return user ?? null;
}

/**
 * The signed-in user, or throw a typed 401 that src/lib/api.ts renders as
 * { ok: false, error: { code: 'UNAUTHORIZED' } }.
 *
 * Every mutating route handler starts with this.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Assert the viewer owns a resource. Pass the resource's owner id.
 *
 * Authentication is not authorization: requireUser() proves *who*, this proves
 * *whose*. Every mutation needs both (docs/STACK.md, API conventions).
 */
export function assertOwner(ownerId: string, viewer: { id: string }): void {
  if (ownerId !== viewer.id) throw new ForbiddenError();
}

/** Narrow any user-ish row to the public shape. */
export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
  };
}
