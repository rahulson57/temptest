import { PUBLIC_USER_SELECT, createSession, hashPassword, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ConflictError, UnauthorizedError } from '@/lib/errors';
import type { PublicUser } from '@/lib/types';
import type { LoginInput, SignupInput } from './schemas';

/**
 * Account creation and credential checking.
 *
 * Route handlers stay thin: they validate, call one of these, and render the
 * envelope. Keeping the logic here means the signup rules are testable without
 * a Request and are impossible to bypass by adding a second route later.
 */

/**
 * ONE message for every credential failure.
 *
 * Exported so the login route and its tests assert the same string: "unknown
 * email" and "wrong password" must be indistinguishable to a client, or the
 * login form becomes an account-enumeration oracle.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect';

const SESSION_SELECT = { ...PUBLIC_USER_SELECT, email: true } as const;

export type AccountUser = PublicUser & { email: string };

/**
 * Create an account and sign the new user in.
 *
 * Duplicate email or handle → 409. The check is explicit (rather than relying on
 * catching Prisma's P2002) so the response can name WHICH field collided, which
 * the signup form renders inline. The unique constraints in the schema are still
 * the backstop for a race between two concurrent signups — see the catch below.
 */
export async function registerUser(input: SignupInput): Promise<AccountUser> {
  await assertAvailable(input.email, input.handle);

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user
    .create({
      data: {
        email: input.email,
        handle: input.handle,
        displayName: input.displayName,
        passwordHash,
      },
      select: SESSION_SELECT,
    })
    .catch((error: unknown) => {
      // Two signups racing on the same email/handle: the loser lands here.
      if (isUniqueViolation(error)) {
        throw new ConflictError('That email address or handle is already taken');
      }
      throw error;
    });

  await createSession({ sub: user.id, email: user.email, handle: user.handle });
  return user;
}

/**
 * Verify credentials and start a session.
 *
 * Every failure path throws the SAME UnauthorizedError. When the email is
 * unknown we still run a bcrypt comparison against a dummy hash so the response
 * time does not reveal whether the account exists.
 */
export async function authenticate(input: LoginInput): Promise<AccountUser> {
  const email = input.email.trim().toLowerCase();

  const record = await prisma.user.findUnique({
    where: { email },
    select: { ...SESSION_SELECT, passwordHash: true },
  });

  const passwordMatches = await verifyPassword(input.password, record?.passwordHash ?? DUMMY_HASH);

  if (!record || !passwordMatches) {
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  const { passwordHash: _passwordHash, ...user } = record;
  await createSession({ sub: user.id, email: user.email, handle: user.handle });
  return user;
}

/** Throws ConflictError naming the field that is already taken. */
async function assertAvailable(email: string, handle: string): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { handle }] },
    select: { email: true, handle: true },
  });
  if (!existing) return;

  if (existing.email === email) {
    throw new ConflictError('An account with that email address already exists');
  }
  throw new ConflictError('That handle is already taken');
}

/**
 * A real bcrypt hash (of a value no one can log in with) used only to keep the
 * unknown-email path as slow as the wrong-password path.
 */
const DUMMY_HASH = '$2a$12$.YiRXh0AJLy6zccjI7tcIeBhfk7aWw.11PTJ4f16gvK5ZKKN6xl9a';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
