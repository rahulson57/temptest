import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, hashPassword, verifyPassword } from '@/lib/auth/password';

describe('hashPassword', () => {
  it('never returns the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('uses the configured cost factor', async () => {
    const hash = await hashPassword('whatever');
    expect(hash).toContain(`$${BCRYPT_COST}$`);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
    // …but both still verify.
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  });

  it('rejects an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    await expect(verifyPassword('s3cret-passphrase', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-passphrase');
    await expect(verifyPassword('s3cret-passphras', hash)).resolves.toBe(false);
    await expect(verifyPassword('S3cret-passphrase', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('handles unicode and long passwords', async () => {
    const password = 'пароль-🔐-' + 'x'.repeat(60);
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('returns false (never throws) for a malformed or empty hash', async () => {
    await expect(verifyPassword('pw', 'not-a-bcrypt-hash')).resolves.toBe(false);
    await expect(verifyPassword('pw', '')).resolves.toBe(false);
    // Defends against a corrupt DB row turning a failed login into a 500.
    await expect(verifyPassword('pw', undefined as unknown as string)).resolves.toBe(false);
  });
});
