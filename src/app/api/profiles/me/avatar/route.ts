import { ok, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { BadRequestError } from '@/lib/errors';
import type { StorageFile } from '@/lib/storage';
import { updateAvatar } from '@/server/profiles/profiles';

/**
 * POST /api/profiles/me/avatar — upload and set the viewer's avatar.
 *
 * 401 signed out · 400 no file, wrong type, or over the size limit
 * 200 the updated PublicUser (with the new avatarUrl).
 *
 * multipart/form-data rather than JSON, so this is the one mutation in the
 * vertical that does NOT go through parseJson — there is no JSON body to parse.
 * Validation is not skipped, it MOVES: type and size are enforced by the
 * foundations StorageAdapter (`@/lib/storage`), which checks the declared size
 * and then the actual bytes. Re-implementing an allowlist here would be a second
 * source of truth for "what is an acceptable image", and the two would drift.
 */
export const POST = withApi(async (request: Request) => {
  const viewer = await requireUser();

  const form = await request.formData().catch(() => {
    throw new BadRequestError('Send the image as multipart/form-data');
  });

  const file = form.get('file');
  if (!isStorageFile(file)) {
    throw new BadRequestError('Choose an image to upload');
  }

  const user = await updateAvatar(viewer, viewer.id, file);
  return ok({ user });
});

/**
 * A web `File` satisfies StorageFile structurally. Check the shape rather than
 * `instanceof File` so the route stays testable without a DOM File constructor.
 */
function isStorageFile(value: unknown): value is StorageFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StorageFile).arrayBuffer === 'function' &&
    typeof (value as StorageFile).type === 'string' &&
    typeof (value as StorageFile).size === 'number'
  );
}
