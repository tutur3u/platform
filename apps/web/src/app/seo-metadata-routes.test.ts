import { createSeoHeaders, PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path';
import { describe, expect, it, vi } from 'vitest';
import { siteConfig } from '@/constants/configs';
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

  it('advertises the sitemap and lets crawlers read redirects and noindex directives', () => {
    const metadata = robots();
    const rules = Array.isArray(metadata.rules)
      ? metadata.rules[0]
      : metadata.rules;

    expect(metadata.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(metadata.sitemap).toBe(
      new URL('/sitemap.xml', siteConfig.url).toString()
    );
    expect(metadata.host).toBe(siteConfig.url);
    expect(rules).toEqual({ userAgent: '*', allow: '/' });
  });

  it('keeps private Web routes noindexed while declared public products remain indexable', () => {
    const patterns = [
      ...PUBLIC_SEO_ROUTES.map(({ pathname }) =>
        pathname.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      ),
      'changelog/[^/]+',
    ];
    const rules = createSeoHeaders('web', patterns, {
      VERCEL_ENV: 'production',
    });
    const noindexed = (pathname: string) =>
      rules.some((rule) => {
        const parsed = tryToParsePath(rule.source);
        expect(parsed.error).toBeUndefined();
        return (
          new RegExp(parsed.regexStr ?? '').test(pathname) &&
          rule.headers.some(
            ({ key, value }) =>
              key === 'X-Robots-Tag' && value === PRIVATE_ROBOTS_HEADER
          )
        );
      });

    for (const pathname of [
      '/api/v1/users',
      '/onboarding',
      '/vi/onboarding',
      '/personal/tasks',
    ]) {
      expect(noindexed(pathname), pathname).toBe(true);
    }
    for (const pathname of ['/products/tasks', '/vi/products/tasks']) {
      expect(noindexed(pathname), pathname).toBe(false);
    }
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
