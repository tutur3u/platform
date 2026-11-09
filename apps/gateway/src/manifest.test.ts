import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchRoute, splitLocale } from './manifest';

const generated = JSON.parse(
  readFileSync(
    new URL(
      '../../web/src/lib/seo/public-routes.generated.json',
      import.meta.url
    ),
    'utf8'
  )
) as string[];

describe('matchRoute', () => {
  it('covers every indexable public marketing path from the web app', () => {
    for (const path of generated) {
      expect(matchRoute(path).cache, path).toBe('page');
    }
  });

  it('matches locale-prefixed public pages and records the locale', () => {
    expect(matchRoute('/vi/pricing')).toMatchObject({
      cache: 'page',
      locale: 'vi',
      pathname: '/pricing',
    });
    expect(matchRoute('/vi')).toMatchObject({ cache: 'page', pathname: '/' });
    expect(matchRoute('/en/products/ai').cache).toBe('page');
  });

  it('matches prefix routes, SEO metadata and static assets', () => {
    expect(matchRoute('/changelog/some-release').cache).toBe('page');
    expect(matchRoute('/legal/dpa').cache).toBe('page');
    expect(matchRoute('/robots.txt').cache).toBe('page');
    expect(matchRoute('/.well-known/security.txt').cache).toBe('page');
    expect(matchRoute('/roadmap').cache).toBe('page');
    expect(matchRoute('/_next/static/chunks/a.js').cache).toBe('static');
    expect(matchRoute('/favicon.ico').cache).toBe('static');
  });

  it('sends everything else to the default pass-through route', () => {
    for (const path of [
      '/login',
      '/api/v1/users',
      '/personal/tasks',
      '/vi/login',
      '/about/team',
      '/aboutx',
      '/_next/image',
      '/vi/robots.txt',
    ]) {
      expect(matchRoute(path), path).toMatchObject({
        routeId: 'default',
        cache: 'bypass',
      });
    }
  });
});

describe('splitLocale', () => {
  it('only strips configured locales', () => {
    expect(splitLocale('/vi/about', ['en', 'vi'])).toEqual({
      locale: 'vi',
      pathname: '/about',
    });
    expect(splitLocale('/fr/about', ['en', 'vi'])).toEqual({
      locale: null,
      pathname: '/fr/about',
    });
  });
});
