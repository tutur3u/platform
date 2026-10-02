import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readPage, from, filters, range } = vi.hoisted(() => {
  const readPage = vi.fn();
  const filters = { eq: vi.fn(), not: vi.fn(), lte: vi.fn(), order: vi.fn() };
  const range = vi.fn();
  const query = {
    select: vi.fn(),
    ...filters,
    range,
    abortSignal: readPage,
  };
  for (const method of [query.select, ...Object.values(filters), range])
    method.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  return { readPage, from, filters, range };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAnonClient: vi.fn().mockResolvedValue({ from }),
}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

import { getPublishedChangelogEntries } from './published-changelog';

describe('published changelog sitemap reader', () => {
  beforeEach(() => {
    readPage.mockReset();
    from.mockClear();
    range.mockClear();
  });

  it('reads all pages through anonymous published-content filters', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      slug: `release-${index}`,
      published_at: '2026-10-01',
      updated_at: null,
    }));
    readPage
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [
          { slug: 'latest', published_at: '2026-10-01', updated_at: null },
        ],
        error: null,
      });
    expect(await getPublishedChangelogEntries()).toHaveLength(1001);
    expect(from).toHaveBeenCalledWith('changelog_entries');
    expect(filters.eq).toHaveBeenCalledWith('is_published', true);
    expect(filters.not).toHaveBeenCalledWith('published_at', 'is', null);
    expect(filters.lte).toHaveBeenCalledWith(
      'published_at',
      expect.any(String)
    );
    expect(filters.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('rejects an upstream failure instead of caching a partial sitemap', async () => {
    readPage.mockResolvedValue({
      data: null,
      error: { message: 'upstream private diagnostic' },
    });
    await expect(getPublishedChangelogEntries()).rejects.toThrow(
      'Unable to read published changelog sitemap entries.'
    );
  });

  it('fails before returning XML beyond the sitemap capacity', async () => {
    readPage.mockResolvedValue({
      data: Array.from({ length: 1000 }, () => ({
        slug: 'entry',
        published_at: '2026-10-01',
        updated_at: null,
      })),
      error: null,
    });
    await expect(getPublishedChangelogEntries()).rejects.toThrow(
      'capacity reached'
    );
    expect(readPage).toHaveBeenCalledTimes(20);
  });
});
