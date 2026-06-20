import { describe, expect, it } from 'vitest';
import {
  defaultLocale,
  getLocaleFromAcceptLanguage,
  getLocaleFromCookieHeader,
  getLocaleFromPathname,
  localeCookieName,
  parseCookieHeader,
  resolveLocaleFromRequest,
  stripLocaleFromPathname,
  withLocalePrefix,
} from './locale';

describe('locale adapters', () => {
  it('matches the legacy default locale and cookie contract', () => {
    expect(defaultLocale).toBe('en');
    expect(localeCookieName).toBe('NEXT_LOCALE');
  });

  it('reads supported locales from pathnames', () => {
    expect(getLocaleFromPathname('/vi/personal/tasks')).toBe('vi');
    expect(getLocaleFromPathname('/EN/login')).toBe('en');
    expect(getLocaleFromPathname('/login')).toBeNull();
  });

  it('strips and applies locale prefixes with as-needed semantics', () => {
    expect(stripLocaleFromPathname('/vi/personal/tasks?view=grid')).toBe(
      '/personal/tasks?view=grid'
    );
    expect(withLocalePrefix('/personal/tasks?view=grid', 'vi')).toBe(
      '/vi/personal/tasks?view=grid'
    );
    expect(withLocalePrefix('/vi/personal/tasks', 'en')).toBe(
      '/personal/tasks'
    );
    expect(withLocalePrefix('/personal/tasks', 'en')).toBe('/personal/tasks');
    expect(
      withLocalePrefix('/personal/tasks', 'en', { localePrefix: 'always' })
    ).toBe('/en/personal/tasks');
  });

  it('parses cookie headers without throwing on encoded values', () => {
    const cookies = parseCookieHeader(
      'NEXT_LOCALE=vi; theme=dark; encoded=a%20b'
    );

    expect(cookies.get('encoded')).toBe('a b');
    expect(getLocaleFromCookieHeader('NEXT_LOCALE=vi')).toBe('vi');
    expect(getLocaleFromCookieHeader('NEXT_LOCALE=fr')).toBeNull();
  });

  it('chooses the highest-priority accept-language locale', () => {
    expect(getLocaleFromAcceptLanguage('fr-CA, vi;q=0.8, en;q=0.7')).toBe('vi');
    expect(getLocaleFromAcceptLanguage('vi;q=0.2, en-US;q=0.9')).toBe('en');
    expect(getLocaleFromAcceptLanguage('fr, de;q=0.8')).toBeNull();
  });

  it('resolves locale from path, cookie, accept-language, then default', () => {
    expect(
      resolveLocaleFromRequest({
        acceptLanguageHeader: 'en;q=0.9',
        cookieHeader: 'NEXT_LOCALE=vi',
        pathname: '/en/settings',
      })
    ).toEqual({ locale: 'en', source: 'path' });
    expect(
      resolveLocaleFromRequest({
        acceptLanguageHeader: 'en;q=0.9',
        cookieHeader: 'NEXT_LOCALE=vi',
        pathname: '/settings',
      })
    ).toEqual({ locale: 'vi', source: 'cookie' });
    expect(
      resolveLocaleFromRequest({
        acceptLanguageHeader: 'vi;q=0.9',
        pathname: '/settings',
      })
    ).toEqual({ locale: 'vi', source: 'accept-language' });
    expect(resolveLocaleFromRequest({ pathname: '/settings' })).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});
