import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcryptjs is pure JS (no native build step) but is CPU-bound and therefore
 * NODE-ONLY — never import this module from middleware or a client component.
 * Cost 12 is ~250ms on current hardware: slow enough to matter to an attacker,
 * fast enough for a login form.
 */
export const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: password must be a non-empty string');
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Constant-time-ish comparison of a candidate password against a stored hash.
 * Returns false (never throws) for malformed hashes so a corrupt row cannot
 * turn a failed login into a 500.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (typeof plain !== 'string' || typeof hash !== 'string' || hash.length === 0) {
    return false;
  }
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
