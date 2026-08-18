import { z, type ZodSchema } from 'zod';
import { parseJson } from '@/lib/api';
import { AppError, ValidationError } from '@/lib/errors';
import { RESERVED_HANDLES, displayNameSchema, emailSchema, passwordSchema } from '@/lib/validation/common';

/**
 * Parse a JSON body, reporting a failed schema as 400 with its field detail intact.
 *
 * Foundations' `parseJson` throws `ValidationError`, which `ERROR_STATUS` maps to
 * 422. This vertical's spec and the review charter both require 400 for a failed
 * body schema, so the code is remapped at the domain boundary rather than in
 * `src/lib`, which is shared with verticals that may legitimately want 422. The
 * rationale in full lives in `src/server/social/schemas.ts` (reverses DEC-155);
 * each domain carries its own copy because this vertical's file scope has no
 * shared server module to hang it on.
 */
export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  try {
    return await parseJson(request, schema);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AppError('BAD_REQUEST', error.message, error.fields);
    }
    throw error;
  }
}

/**
 * Account schemas.
 *
 * Built on the foundations primitives (`@/lib/validation/common`) so signup, the
 * signup form and the profile editor cannot drift apart on what a valid email or
 * display name is.
 *
 * HANDLE: this vertical's spec is stricter than the shared `handleSchema`
 * (which allows up to 30 characters and mixed case). Public handles here are
 * `^[a-z0-9_]{3,20}$` after trimming and lower-casing, so `/u/<handle>` URLs
 * are unambiguous and case-insensitively unique. Reserved app routes
 * (`settings`, `login`, `api`, …) stay reserved — that list lives in
 * foundations and is imported, not copied.
 */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const accountHandleSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'Handles are at least 3 characters')
      .max(20, 'Handles are at most 20 characters')
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
      .refine((value) => !RESERVED_HANDLES.has(value), 'That handle is reserved'),
  );

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: accountHandleSchema,
  displayName: displayNameSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Login deliberately does NOT reuse `passwordSchema`'s length rule.
 *
 * If a too-short password failed validation with "use at least 8 characters",
 * the response would differ from a wrong-password response — and an attacker
 * learns which rule your stored passwords satisfy. Login only checks that
 * something was sent; everything else is one generic 401.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
