import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session-token';
import { sessionTokenFor, type SessionUserLike } from '../helpers/auth';
import { createCookieStoreMock } from '../helpers/request';

/**
 * Shared plumbing for the upload route tests.
 *
 * The storage adapter is redirected at a throwaway directory (see
 * TEST_UPLOAD_DIR) rather than the real ./public/uploads. Two reasons: a test
 * run must not leave files in the repository, and the suite needs to assert
 * that bytes actually landed on disk — which means owning the directory it
 * inspects. It is still the REAL LocalDiskAdapter, so key generation, the
 * path-traversal guard and the write itself are all exercised for real.
 */

/**
 * Throwaway upload root.
 *
 * OUTSIDE THE REPOSITORY (os tmpdir), not a dot-directory inside it: .gitignore
 * is foundations-owned and this vertical cannot add an entry to it, so a test
 * directory in the working tree would show up as untracked noise in every
 * `git status` the moment a run was interrupted before its cleanup. Per-pid so
 * two concurrent runs cannot delete each other's files — the same rule the
 * database harness follows (docs/STACK.md §8).
 */
export const TEST_UPLOAD_DIR = join(tmpdir(), `quill-uploads-test-${process.pid}`);

export const cookieStore = createCookieStoreMock();

export async function signIn(user: SessionUserLike): Promise<void> {
  cookieStore.set(SESSION_COOKIE_NAME, await sessionTokenFor(user));
}

export function signOut(): void {
  cookieStore.clear();
}

/** A File of exactly `bytes` bytes with the given MIME type. */
export function fakeImage(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes).fill(0x41)], name, { type });
}

/** multipart/form-data body carrying one file under `field`. */
export function uploadForm(file: File, field = 'file'): FormData {
  const form = new FormData();
  form.set(field, file);
  return form;
}
