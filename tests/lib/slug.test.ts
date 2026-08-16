import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  slugify,
  slugifyWithFallback,
  uniqueSlug,
  uniqueSlugFrom,
} from '@/lib/slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('The Measure of a Paragraph')).toBe('the-measure-of-a-paragraph');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('Hello --- World!!!  Again')).toBe('hello-world-again');
  });

  it('folds accents to ASCII', () => {
    expect(slugify('Café Society')).toBe('cafe-society');
    expect(slugify('naïve résumé')).toBe('naive-resume');
  });

  it('drops apostrophes rather than turning them into hyphens', () => {
    expect(slugify("Don't Panic")).toBe('dont-panic');
    expect(slugify('Don’t Panic')).toBe('dont-panic');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  ...hello...  ')).toBe('hello');
  });

  it('returns empty string for input with nothing usable', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });

  it('truncates on a hyphen boundary within the length budget', () => {
    const long = 'word '.repeat(40).trim();
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    // Never cuts a word in half.
    expect(slug.split('-').every((part) => part === 'word')).toBe(true);
  });
});

describe('slugifyWithFallback', () => {
  it('falls back when the input yields nothing', () => {
    expect(slugifyWithFallback('!!!')).toBe('untitled');
    expect(slugifyWithFallback('***', 'story')).toBe('story');
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const taken = new Set<string>();
    await expect(uniqueSlug('Hello World', async (c) => taken.has(c))).resolves.toBe('hello-world');
  });

  it('probes -2 on the first collision', async () => {
    const taken = new Set(['hello-world']);
    await expect(uniqueSlug('Hello World', async (c) => taken.has(c))).resolves.toBe(
      'hello-world-2',
    );
  });

  it('keeps probing -3, -4 … past consecutive collisions', async () => {
    const taken = new Set(['hello-world', 'hello-world-2', 'hello-world-3']);
    await expect(uniqueSlug('Hello World', async (c) => taken.has(c))).resolves.toBe(
      'hello-world-4',
    );
  });

  it('produces a fresh slug each time when results are recorded (simulating inserts)', async () => {
    const taken = new Set<string>();
    const exists = async (candidate: string) => taken.has(candidate);

    const results: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const slug = await uniqueSlug('Same Title', exists);
      taken.add(slug);
      results.push(slug);
    }

    expect(results).toEqual(['same-title', 'same-title-2', 'same-title-3', 'same-title-4']);
    expect(new Set(results).size).toBe(4);
  });

  it('keeps the suffixed slug inside the length budget', async () => {
    const long = 'a'.repeat(MAX_SLUG_LENGTH + 20);
    const base = await uniqueSlug(long, async () => false);
    const taken = new Set([base]);
    const second = await uniqueSlug(long, async (c) => taken.has(c));

    expect(base.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(second.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(second).not.toBe(base);
    expect(second.endsWith('-2')).toBe(true);
  });

  it('falls back for untitled input instead of producing an empty slug', async () => {
    await expect(uniqueSlug('!!!', async () => false)).resolves.toBe('untitled');
  });

  it('throws rather than looping forever when every candidate is taken', async () => {
    await expect(uniqueSlug('taken', async () => true, 5)).rejects.toThrow(
      /Could not find a free slug/,
    );
  });
});

describe('uniqueSlugFrom', () => {
  it('resolves collisions against an in-memory set', () => {
    expect(uniqueSlugFrom('Hello', [])).toBe('hello');
    expect(uniqueSlugFrom('Hello', ['hello'])).toBe('hello-2');
    expect(uniqueSlugFrom('Hello', ['hello', 'hello-2'])).toBe('hello-3');
  });
});
