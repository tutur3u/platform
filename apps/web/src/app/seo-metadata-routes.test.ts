import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_SEO_ROUTES } from '@/lib/seo/public-routes';
import { getPublishedChangelogEntries } from '@/lib/seo/published-changelog';
import robots from './robots';
import sitemap from './sitemap';

vi.mock('@/lib/seo/published-changelog', () => ({
  getPublishedChangelogEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

describe('SEO metadata routes', () => {
  it('publishes every indexable route in both supported locales', async () => {
    const entries = await sitemap();

    expect(entries).toHaveLength(PUBLIC_SEO_ROUTES.length * 2);
    expect(entries.some((entry) => entry.url.endsWith('/products/tasks'))).toBe(
      true
    );
    expect(
      entries.some((entry) => entry.url.endsWith('/vi/products/tasks'))
    ).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith('/pricing'))).toBe(false);

    for (const entry of entries) {
      expect(entry.alternates?.languages).toMatchObject({
        'en-US': expect.any(String),
        'vi-VN': expect.any(String),
        'x-default': expect.any(String),
      });
    }
  });

  it('advertises the sitemap while protecting private routes and allowing redirects', () => {
    const metadata = robots();
    const rules = Array.isArray(metadata.rules)
      ? metadata.rules[0]
      : metadata.rules;

    expect(metadata.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(rules?.allow).toBe('/');
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(['/api/', '/onboarding', '/vi/onboarding'])
    );
    expect(rules?.disallow).not.toContain('/pricing');
    expect(rules?.disallow).not.toContain('/products/meet-together');
  });

  it('adds newly published entries without changing the public route manifest', async () => {
    vi.mocked(getPublishedChangelogEntries).mockResolvedValueOnce([
      {
        slug: 'new-release',
        published_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-02T00:00:00Z',
      },
    ]);
    const entries = await sitemap();
    expect(entries).toHaveLength(PUBLIC_SEO_ROUTES.length * 2 + 2);
    expect(
      entries.filter((entry) => entry.url.endsWith('/changelog/new-release'))
    ).toHaveLength(2);
  });

  it('does not return a successful incomplete sitemap when the reader fails', async () => {
    vi.mocked(getPublishedChangelogEntries).mockRejectedValueOnce(
      new Error('Reader unavailable')
    );
    await expect(sitemap()).rejects.toThrow('Reader unavailable');
  });
});
