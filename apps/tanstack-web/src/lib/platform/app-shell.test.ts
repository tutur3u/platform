import { describe, expect, it } from 'vitest';
import {
  createLegacyRootLayoutHead,
  findUnsupportedLocaleRouteMatch,
  getAppShellDocumentLocale,
  getAppShellDocumentLocaleFromMatches,
  hasLocalizedRouteMatch,
} from './app-shell';

describe('app shell compatibility helpers', () => {
  it('finds unsupported localized route matches with legacy exact casing', () => {
    expect(
      findUnsupportedLocaleRouteMatch([
        { params: {}, routeId: '__root__' },
        { params: { locale: 'fr' }, routeId: '/$locale/about' },
      ])
    ).toEqual({ locale: 'fr', routeId: '/$locale/about' });

    expect(
      findUnsupportedLocaleRouteMatch([
        { params: { locale: 'EN' }, routeId: '/$locale/' },
      ])
    ).toEqual({ locale: 'EN', routeId: '/$locale/' });
  });

  it('allows supported localized matches and unlocalized routes', () => {
    expect(
      findUnsupportedLocaleRouteMatch([
        { params: { locale: 'en' }, routeId: '/$locale/about' },
        { params: { locale: 'vi' }, routeId: '/$locale/security' },
      ])
    ).toBeNull();
    expect(
      findUnsupportedLocaleRouteMatch([
        { params: { locale: 'fr' }, routeId: '/pricing' },
      ])
    ).toBeNull();
    expect(
      hasLocalizedRouteMatch([{ routeId: '/$locale/products/tasks' }])
    ).toBe(true);
  });

  it('derives document locale only from exact supported path locales', () => {
    expect(getAppShellDocumentLocale('/vi/about')).toBe('vi');
    expect(getAppShellDocumentLocale('/en/about')).toBe('en');
    expect(getAppShellDocumentLocale('/EN/about')).toBe('en');
    expect(getAppShellDocumentLocale('/fr/about')).toBe('en');
    expect(getAppShellDocumentLocale('/pricing')).toBe('en');
  });

  it('derives document locale from active localized matches', () => {
    expect(
      getAppShellDocumentLocaleFromMatches([
        { routeId: '__root__' },
        { params: { locale: 'vi' }, routeId: '/$locale/about' },
      ])
    ).toBe('vi');
    expect(
      getAppShellDocumentLocaleFromMatches([
        { params: { locale: 'fr' }, routeId: '/$locale/about' },
      ])
    ).toBe('en');
  });

  it('creates legacy-compatible localized root head descriptors', () => {
    const head = createLegacyRootLayoutHead('vi', {
      stylesheets: ['/assets/app.css'],
    });

    expect(head.links).toContainEqual({
      href: '/assets/app.css',
      rel: 'stylesheet',
    });
    expect(head.links).not.toContainEqual({
      href: '/manifest.webmanifest',
      rel: 'manifest',
    });
    expect(head.meta).toContainEqual({ title: 'Tuturuuu' });
    expect(head.meta).toContainEqual({
      content: 'Quản lý công việc của bạn, siêu tốc độ cùng AI.',
      name: 'description',
    });
    expect(head.meta).toContainEqual({
      content: 'vi_VN',
      property: 'og:locale',
    });
    expect(head.meta).toContainEqual({
      content: 'telephone=no',
      name: 'format-detection',
    });
    expect(head.meta).toContainEqual({
      content:
        'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      name: 'robots',
    });
  });
});
