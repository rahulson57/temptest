/**
 * Typed application errors.
 *
 * Route handlers throw these; `src/lib/api.ts` maps them to HTTP status codes
 * and a stable JSON envelope. Never leak a raw Error message to a client —
 * anything not an AppError becomes a generic 500.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Field-level validation detail, keyed by dotted field path. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message: string, fields?: FieldErrors) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (fields) this.fields = fields;
    Error.captureStackTrace?.(this, AppError);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super('BAD_REQUEST', message);
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields?: FieldErrors) {
    super('VALIDATION_FAILED', message, fields);
    this.name = 'ValidationError';
  }
}

/** Thrown by requireUser() when there is no valid session. */
export class UnauthorizedError extends AppError {
  constructor(message = 'You must be signed in to do that') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

/** Thrown when a signed-in user does not own the resource they are mutating. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do that') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'That already exists') {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
