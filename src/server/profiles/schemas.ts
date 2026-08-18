import { z, type ZodSchema } from 'zod';
import { parseJson } from '@/lib/api';
import { AppError, ValidationError } from '@/lib/errors';
import { bioSchema, displayNameSchema, imageUrlSchema } from '@/lib/validation/common';

/**
 * Parse a JSON body, reporting a failed schema as 400 with its field detail intact.
 *
 * Same remap as `src/server/auth/schemas.ts` and `src/server/social/schemas.ts`,
 * where the full rationale lives: foundations answers a failed body schema with
 * 422, this vertical's spec and its rejection tests require 400, and `src/lib` is
 * shared so the remap belongs at the domain boundary.
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
 * Profile editing schema.
 *
 * PATCH semantics: every field is optional, and only the keys actually PRESENT
 * are written. `{ bio: "" }` clears the bio; omitting `bio` leaves it alone.
 * Those are different intentions, so this schema must not add defaults — a
 * `.transform()` that materialises an absent key would silently wipe the field
 * it was never asked about. (`optionalImageUrlSchema` in
 * `@/lib/validation/common` does exactly that, which is why `avatarUrl` is
 * composed from `imageUrlSchema` here instead of reused wholesale.)
 *
 * `email`, `handle` and the password are deliberately NOT editable here.
 * Changing an email or a handle is an identity change — it invalidates
 * `/u/<handle>` links and the claims inside live session cookies — so it needs
 * its own flow rather than riding along on a bio edit.
 */
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.optional(),
    /** '' removes the avatar; a URL or /uploads path sets it. */
    avatarUrl: z.union([imageUrlSchema, z.literal('')]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** `/u/[handle]` segment. Kept permissive: an unknown handle is a 404, not a 400. */
export const handleParamSchema = z
  .string()
  .trim()
  .min(1, 'Missing handle')
  .max(30, 'Invalid handle')
  .transform((value) => value.toLowerCase());
