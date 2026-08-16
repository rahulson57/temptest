/**
 * Tiny class-name joiner.
 *
 * Deliberately not clsx+tailwind-merge: the design system uses a small, fixed
 * set of component variants, so conflicting-class resolution is a problem we
 * don't have. Falsy values are dropped so `cn('a', cond && 'b')` reads well.
 */
export type ClassValue = string | number | null | undefined | false;

export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string | number => Boolean(value)).join(' ');
}

export default cn;
