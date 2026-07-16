import { describe, expect, it } from 'vitest';
import { getPublicLocalizedPath, PUBLIC_SEO_ROUTES } from './public-routes';

describe('public SEO routes', () => {
  it('contains unique, normalized indexable paths', () => {
    const pathnames = PUBLIC_SEO_ROUTES.map((route) => route.pathname);

    expect(new Set(pathnames).size).toBe(pathnames.length);
    expect(pathnames).toContain('/');
    expect(pathnames).not.toContain('/pricing');
    expect(pathnames).not.toContain('/onboarding');

    for (const pathname of pathnames) {
      expect(pathname).toMatch(/^\/(?:[^/]+(?:\/[^/]+)*)?$/);
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
