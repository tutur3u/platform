import { describe, expect, it } from 'vitest';
import {
  localeChangePath,
  matchBrowserLocale,
  readLocalePreference,
  stripLocalePrefix,
} from './locale-preference';

describe('readLocalePreference', () => {
  it('returns the stored supported locale', () => {
    expect(readLocalePreference('a=1; NEXT_LOCALE=vi; b=2')).toBe('vi');
  });

  it('treats a missing or unsupported cookie as the system language', () => {
    expect(readLocalePreference('')).toBeNull();
    expect(readLocalePreference('NEXT_LOCALE=fr')).toBeNull();
    expect(readLocalePreference('MY_NEXT_LOCALE=vi')).toBeNull();
  });

  it('uses the first supported copy, which the browser lists most specific first', () => {
    expect(readLocalePreference('NEXT_LOCALE=en; NEXT_LOCALE=vi')).toBe('en');
    expect(readLocalePreference('NEXT_LOCALE=%ZZ; NEXT_LOCALE=vi')).toBe('vi');
  });
});

describe('stripLocalePrefix', () => {
  it.each([
    ['/vi/personal/meetings', '/personal/meetings'],
    ['/en', '/'],
    ['/vi/', '/'],
    ['/personal/meetings', '/personal/meetings'],
    ['/', '/'],
    ['/video/x', '/video/x'],
  ])('maps %s to %s at a root host', (pathname, expected) => {
    expect(stripLocalePrefix(pathname)).toBe(expected);
  });

  it.each([
    ['/meet/vi/personal', '/meet/personal'],
    ['/meet/vi', '/meet'],
    ['/meet/personal', '/meet/personal'],
    ['/meeting/vi/x', '/meeting/vi/x'],
  ])('keeps the mount base: %s to %s', (pathname, expected) => {
    expect(stripLocalePrefix(pathname, ['en', 'vi'], '/meet')).toBe(expected);
  });
});

describe('matchBrowserLocale', () => {
  it('picks the first supported browser language by tag or base', () => {
    expect(matchBrowserLocale(['fr-FR', 'vi-VN', 'en'])).toBe('vi');
    expect(matchBrowserLocale(['en-US', 'vi'])).toBe('en');
  });

  it('falls back to the first supported locale', () => {
    expect(matchBrowserLocale(['fr', 'de'])).toBe('en');
    expect(matchBrowserLocale([])).toBe('en');
  });
});

describe('localeChangePath', () => {
  it.each([
    // Web's unprefixed public pages are English-only; Vietnamese needs /vi.
    ['/about', 'vi', '/vi/about'],
    ['/', 'vi', '/vi'],
    ['/vi/about', 'en', '/en/about'],
    ['/en/personal/meetings', 'vi', '/vi/personal/meetings'],
    ['/video', 'vi', '/vi/video'],
  ])('loads %s under %s as %s', (pathname, locale, expected) => {
    expect(localeChangePath(pathname, locale)).toBe(expected);
  });

  it.each([
    ['/meet/personal', 'vi', '/meet/vi/personal'],
    ['/meet/vi/personal', 'en', '/meet/en/personal'],
    ['/meet', 'vi', '/meet/vi'],
  ])(
    'keeps the mount base: %s under %s as %s',
    (pathname, locale, expected) => {
      expect(localeChangePath(pathname, locale, ['en', 'vi'], '/meet')).toBe(
        expected
      );
    }
  );
});
