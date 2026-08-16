import { describe, expect, it } from 'vitest';
import type { Page } from '@/lib/pagination';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  emptyPage,
  normalizeLimit,
  pageParams,
  prismaPageArgs,
  takeWithLookahead,
  toPage,
  toPageBy,
} from '@/lib/pagination';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i + 1}` }));

describe('normalizeLimit', () => {
  it('defaults to 10', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(normalizeLimit(undefined)).toBe(10);
    expect(normalizeLimit(null)).toBe(10);
  });

  it('caps at 50 so a client cannot request the whole table', () => {
    expect(MAX_PAGE_SIZE).toBe(50);
    expect(normalizeLimit(500)).toBe(50);
    expect(normalizeLimit('9999')).toBe(50);
  });

  it('rejects zero and negatives', () => {
    expect(normalizeLimit(0)).toBe(10);
    expect(normalizeLimit(-5)).toBe(10);
  });

  it('parses numeric strings from query params', () => {
    expect(normalizeLimit('25')).toBe(25);
    expect(normalizeLimit('abc')).toBe(10);
  });
});

describe('pageParams', () => {
  it('normalizes limit and passes a cursor through', () => {
    expect(pageParams({ limit: '20', cursor: 'abc' })).toEqual({ limit: 20, cursor: 'abc' });
  });

  it('omits blank cursors', () => {
    expect(pageParams({ cursor: '   ' })).toEqual({ limit: 10 });
    expect(pageParams({})).toEqual({ limit: 10 });
  });
});

describe('prismaPageArgs', () => {
  it('takes one extra row as lookahead', () => {
    expect(prismaPageArgs({ limit: 10 })).toEqual({ take: 11 });
    expect(takeWithLookahead(10)).toBe(11);
  });

  it('skips the cursor row itself on subsequent pages', () => {
    expect(prismaPageArgs({ limit: 5, cursor: 'abc' })).toEqual({
      take: 6,
      cursor: { id: 'abc' },
      skip: 1,
    });
  });
});

describe('toPage', () => {
  it('trims the lookahead row and reports the next cursor', () => {
    const page = toPage(rows(11), 10);
    expect(page.items).toHaveLength(10);
    expect(page.items[9]?.id).toBe('id-10');
    expect(page.nextCursor).toBe('id-10');
  });

  it('returns nextCursor: null on the last page', () => {
    const page = toPage(rows(7), 10);
    expect(page.items).toHaveLength(7);
    expect(page.nextCursor).toBeNull();
  });

  it('returns null cursor on an exactly-full page with no extra row', () => {
    // 10 rows fetched for a limit of 10 means the lookahead found nothing.
    const page = toPage(rows(10), 10);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBeNull();
  });

  it('handles an empty result set', () => {
    expect(toPage([], 10)).toEqual({ items: [], nextCursor: null });
    expect(emptyPage()).toEqual({ items: [], nextCursor: null });
  });

  it('walks a full result set without repeating or dropping items', () => {
    const all = rows(25);
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 10; guard += 1) {
      const at: string | null = cursor;
      const start: number = at ? all.findIndex((r) => r.id === at) + 1 : 0;
      const page: Page<{ id: string }> = toPage(all.slice(start, start + 11), 10);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual(all.map((r) => r.id));
    expect(new Set(seen).size).toBe(25);
  });
});

describe('toPageBy', () => {
  it('derives the cursor from a custom field', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ slug: `s-${i + 1}` }));
    const page = toPageBy(items, 10, (row) => row.slug);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBe('s-10');
  });
});
