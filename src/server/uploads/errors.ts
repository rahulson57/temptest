import { NextResponse } from 'next/server';
import type { ApiFailure } from '@/lib/api';
import type { ErrorCode } from '@/lib/errors';

/**
 * The two upload rejections foundations does not yet have codes for.
 *
 * TEMPORARY — DEC-157. `src/lib/errors.ts` gains `PAYLOAD_TOO_LARGE` → 413 and
 * `UNSUPPORTED_MEDIA_TYPE` → 415 in TASK-008. The moment that lands, this whole
 * module is deleted and the two call sites in src/server/uploads/service.ts
 * become plain `throw new AppError('PAYLOAD_TOO_LARGE', …)` handled by withApi.
 *
 * Until then the codes cannot be constructed: `ErrorCode` is a closed union and
 * `ERROR_STATUS` has no entry for them, so `AppError` would compile-fail and
 * `fail()` would produce `undefined` as a status. Foundations files are closed
 * to this vertical (fileScope), so the interim answer lives here.
 *
 * What this module deliberately does NOT do is invent a second error format.
 * `uploadMediaFailure()` emits the byte-identical `{ ok: false, error: { code,
 * message } }` envelope from src/lib/api.ts — only the status number comes from
 * here. Clients branch on `ok`, so they cannot tell the difference, and the
 * cleanup is a deletion rather than a client-visible contract change.
 */

/** Status codes that will move into ERROR_STATUS in TASK-008. */
export const UPLOAD_ERROR_STATUS = {
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
} as const;

export type UploadErrorCode = keyof typeof UPLOAD_ERROR_STATUS;

/** Thrown by the upload service; rendered by `uploadMediaFailure` in the route. */
export class UploadMediaError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number;

  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = 'UploadMediaError';
    this.code = code;
    this.status = UPLOAD_ERROR_STATUS[code];
  }
}

export function isUploadMediaError(error: unknown): error is UploadMediaError {
  return error instanceof UploadMediaError;
}

/**
 * Render an UploadMediaError as the standard failure envelope.
 *
 * The cast on `code` is the one place this module admits it is ahead of
 * foundations: the string is exactly the ErrorCode TASK-008 adds, so the wire
 * format is already final and only the type declaration lags.
 */
export function uploadMediaFailure(error: UploadMediaError): NextResponse<ApiFailure> {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code: error.code as ErrorCode, message: error.message } },
    { status: error.status },
  );
}
