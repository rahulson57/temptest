import { created, withApi } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { BadRequestError } from '@/lib/errors';
import { isUploadMediaError, uploadMediaFailure } from '@/server/uploads/errors';
import { createUpload, fileFromFormData } from '@/server/uploads/service';

/**
 * POST /api/uploads — one image, multipart/form-data, field name "file".
 *
 * Serves both the editor's inline images and story cover images.
 *
 * AUTH FIRST, ALWAYS. requireUser() runs before the body is read, so a
 * signed-out request is 401 even when it carries a 50MB payload — an
 * unauthenticated caller must never be able to make us buffer their bytes.
 *
 * Status codes: 401 signed out · 415 wrong type · 413 over 5MB · 400 no file.
 */
export const POST = withApi(async (request: Request) => {
  const viewer = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BadRequestError('Send the image as multipart/form-data');
  }

  try {
    const upload = await createUpload(viewer, fileFromFormData(form));
    return created(upload);
  } catch (error) {
    // 413/415 have no ErrorCode until TASK-008 lands (DEC-157); render them
    // here in the standard envelope rather than letting withApi call them 500.
    if (isUploadMediaError(error)) return uploadMediaFailure(error);
    throw error;
  }
});
