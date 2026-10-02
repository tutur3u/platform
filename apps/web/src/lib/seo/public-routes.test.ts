import { describe, expect, it } from 'vitest';
import { APP_PUBLIC_PATHS } from '@/constants/public_paths';
import { getPublicLocalizedPath, PUBLIC_SEO_ROUTES } from './public-routes';

describe('public SEO routes', () => {
  it('contains unique, normalized indexable paths', () => {
    const pathnames = PUBLIC_SEO_ROUTES.map((route) => route.pathname);

    expect(new Set(pathnames).size).toBe(pathnames.length);
    expect(pathnames).toContain('/');
    expect(pathnames).toContain('/portfolio');
    expect(pathnames).not.toContain('/pricing');
    expect(pathnames).not.toContain('/onboarding');

    for (const pathname of pathnames) {
      expect(pathname).toMatch(/^\/(?:[^/]+(?:\/[^/]+)*)?$/);
    }
  });

  it('only advertises routes reachable by anonymous crawlers in both locales', () => {
    for (const { pathname } of PUBLIC_SEO_ROUTES) {
      for (const locale of ['en', 'vi'] as const) {
        const url = getPublicLocalizedPath(pathname, locale);
        // Root exceptions are guarded against the actual proxy auth options in
        // __tests__/proxy.test.ts, including the otherwise unlisted /vi path.
        if (pathname === '/') continue;
        expect(
          APP_PUBLIC_PATHS.some(
            (prefix) => url === prefix || url.startsWith(`${prefix}/`)
          ),
          url
        ).toBe(true);
      }
    }
  });

  it('matches the unprefixed English and prefixed Vietnamese router paths', () => {
    expect(getPublicLocalizedPath('/', 'en')).toBe('/');
    expect(getPublicLocalizedPath('/', 'vi')).toBe('/vi');
    expect(getPublicLocalizedPath('/products/tasks', 'en')).toBe(
      '/products/tasks'
    );
    expect(getPublicLocalizedPath('/products/tasks', 'vi')).toBe(
      '/vi/products/tasks'
    );
  });
});
