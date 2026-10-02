import { describe, expect, it } from 'vitest';
import {
  createChangelogSitemapEntries,
  createSitemapEntries,
} from './sitemap-entries';

const now = Date.parse('2026-10-02T12:00:00Z');
const entry = (slug: string, overrides = {}) => ({
  slug,
  published_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  ...overrides,
});

describe('sitemap entries', () => {
  it('pairs canonical URLs with reciprocal language alternates', () => {
    const entries = createSitemapEntries('/products/tasks');
    expect(entries.map((item) => new URL(item.url).pathname)).toEqual([
      '/products/tasks',
      '/vi/products/tasks',
    ]);
    expect(entries[0]?.alternates).toEqual(entries[1]?.alternates);
    expect(entries[0]?.lastModified).toBeUndefined();
  });

  it('indexes newly published content using real modification dates and encoded slugs', () => {
    const entries = createChangelogSitemapEntries([entry('team update')], now);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.url).toContain('/changelog/team%20update');
    expect(entries[0]?.lastModified).toBe('2026-10-02T10:00:00.000Z');
  });

  it('rejects future posts, missing dates, duplicate slugs and path injection', () => {
    const entries = createChangelogSitemapEntries(
      [
        entry('good'),
        entry('good'),
        entry('../private'),
        entry('x?preview=1'),
        entry('x#anchor'),
        entry('x\\private'),
        entry('..'),
        entry(' good '),
        entry('draft', { published_at: null }),
        entry('future', { published_at: '2026-10-03T00:00:00Z' }),
        entry('invalid', { published_at: 'invalid' }),
      ],
      now
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((item) => item.url.endsWith('/good'))).toBe(true);
  });

  it('does not invent modification dates or let them precede publication', () => {
    const entries = createChangelogSitemapEntries(
      [
        entry('old', { updated_at: '2020-01-01T00:00:00Z' }),
        entry('future-update', { updated_at: '2099-01-01T00:00:00Z' }),
      ],
      now
    );
    expect(
      entries.every((item) => item.lastModified === '2026-10-01T12:00:00.000Z')
    ).toBe(true);
  });
});
