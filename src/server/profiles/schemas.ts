import { z } from 'zod';
import { bioSchema, displayNameSchema, imageUrlSchema } from '@/lib/validation/common';

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
