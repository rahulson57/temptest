/**
 * Slug generation and collision handling.
 *
 * Slugs are URL identity for stories and tags, so they must be stable, ASCII,
 * and unique. `uniqueSlug` probes -2, -3, -4 … against a caller-supplied
 * existence check, which keeps this module free of any database import and
 * therefore trivially unit-testable.
 */

export const MAX_SLUG_LENGTH = 80;

/**
 * Slugify arbitrary text: lowercase, accents folded, non-alphanumerics collapsed
 * to single hyphens, trimmed to MAX_SLUG_LENGTH on a hyphen boundary.
 *
 * Returns '' for input with no usable characters — callers should fall back
 * (see `slugifyWithFallback`).
 */
export function slugify(input: string | null | undefined, maxLength = MAX_SLUG_LENGTH): string {
  if (typeof input !== 'string') return '';
  const base = input
    .normalize('NFKD')
    // Strip combining marks left behind by NFKD (e-acute -> e).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length <= maxLength) return base;
  const clipped = base.slice(0, maxLength);
  const lastHyphen = clipped.lastIndexOf('-');
  return (lastHyphen > 0 ? clipped.slice(0, lastHyphen) : clipped).replace(/-+$/g, '');
}

/** Slugify, falling back to `fallback` when the input yields nothing usable. */
export function slugifyWithFallback(input: string | null | undefined, fallback = 'untitled'): string {
  const slug = slugify(input);
  return slug.length > 0 ? slug : fallback;
}

/**
 * Find a free slug by probing suffixes: `base`, `base-2`, `base-3`, …
 *
 * @param desired  Raw text or an already-slugified string.
 * @param exists   Returns true when the candidate is already taken.
 * @param maxAttempts Safety valve; throws rather than looping forever.
 */
export async function uniqueSlug(
  desired: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 200,
): Promise<string> {
  const base = slugifyWithFallback(desired);

  if (!(await exists(base))) return base;

  for (let n = 2; n <= maxAttempts; n += 1) {
    const suffix = `-${n}`;
    // Keep the suffix inside the length budget rather than overflowing it.
    const trimmedBase =
      base.length + suffix.length > MAX_SLUG_LENGTH
        ? base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '')
        : base;
    const candidate = `${trimmedBase}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error(`Could not find a free slug for "${base}" after ${maxAttempts} attempts`);
}

/** Synchronous variant for callers that already hold the taken set in memory. */
export function uniqueSlugFrom(desired: string, taken: Iterable<string>): string {
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  const base = slugifyWithFallback(desired);
  if (!takenSet.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!takenSet.has(candidate)) return candidate;
  }
}

export default slugify;
