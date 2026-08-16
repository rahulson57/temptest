import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import {
  AppError,
  ERROR_STATUS,
  ValidationError,
  isAppError,
  type ErrorCode,
  type FieldErrors,
} from './errors';

/**
 * The one JSON envelope every API route returns.
 *
 * Success: { ok: true,  data: T }
 * Failure: { ok: false, error: { code, message, fields? } }
 *
 * Clients branch on `ok` alone — never on the HTTP status — so a network layer
 * can stay dumb. Status codes are still set correctly for caches and proxies.
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: ErrorCode; message: string; fields?: FieldErrors };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** 200 (or `status`) with a success envelope. */
export function ok<T>(data: T, status = 200, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { ...init, status });
}

/** 201 helper for resource creation. */
export function created<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return ok(data, 201, init);
}

/** Failure envelope with the status implied by the error code. */
export function fail(
  code: ErrorCode,
  message: string,
  fields?: FieldErrors,
  init?: ResponseInit,
): NextResponse<ApiFailure> {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: fields ? { code, message, fields } : { code, message } },
    { ...init, status: ERROR_STATUS[code] },
  );
}

/**
 * Map any thrown value to a failure response.
 *
 * AppErrors and ZodErrors carry safe, user-facing messages. Everything else is
 * an unexpected bug: log it server-side, return an opaque 500.
 */
export function failFromError(error: unknown): NextResponse<ApiFailure> {
  if (isAppError(error)) {
    return fail(error.code, error.message, error.fields);
  }
  if (error instanceof ZodError) {
    const { message, fields } = zodToFieldErrors(error);
    return fail('VALIDATION_FAILED', message, fields);
  }
  console.error('[api] unhandled error', error);
  return fail('INTERNAL', 'Something went wrong. Please try again.');
}

/**
 * Wrap a route handler so thrown AppErrors become proper envelopes.
 *
 * Usage:
 *   export const POST = withApi(async (req) => ok(await createThing(req)));
 */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse> | NextResponse,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return failFromError(error);
    }
  };
}

/** Flatten a ZodError into { message, fields } for the envelope. */
export function zodToFieldErrors(error: ZodError): { message: string; fields: FieldErrors } {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fields[path] ??= []).push(issue.message);
  }
  const first = error.issues[0];
  return {
    message: first ? first.message : 'Validation failed',
    fields,
  };
}

/**
 * Parse and validate a JSON request body. Throws ValidationError on bad shape
 * and BAD_REQUEST on unparseable JSON — both land as clean envelopes via withApi.
 *
 * Every mutation route MUST go through this (see docs/STACK.md).
 */
export async function parseJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const { message, fields } = zodToFieldErrors(result.error);
    throw new ValidationError(message, fields);
  }
  return result.data;
}

/** Parse and validate URL search params (list endpoints, filters). */
export function parseQuery<T>(request: Request, schema: ZodSchema<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    const { message, fields } = zodToFieldErrors(result.error);
    throw new ValidationError(message, fields);
  }
  return result.data;
}
