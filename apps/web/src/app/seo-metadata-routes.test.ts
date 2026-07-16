import { describe, expect, it } from 'vitest';
import { PUBLIC_SEO_ROUTES } from '@/lib/seo/public-routes';
import robots from './robots';
import sitemap from './sitemap';

describe('SEO metadata routes', () => {
  it('publishes every indexable route in both supported locales', () => {
    const entries = sitemap();

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

  it('advertises the sitemap while protecting private and redirect routes', () => {
    const metadata = robots();
    const rules = Array.isArray(metadata.rules)
      ? metadata.rules[0]
      : metadata.rules;

    expect(metadata.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(rules?.allow).toBe('/');
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(['/api/', '/onboarding', '/vi/onboarding'])
    );
  });
});
