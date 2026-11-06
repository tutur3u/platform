import { describe, expect, it } from 'vitest';
import { preferredRequestLocale, resolveRequestLocale } from './request-locale';

describe('resolveRequestLocale', () => {
  const fallback = () => 'en' as const;

  it('prefers the path prefix, then the cookie, then the fallback', () => {
    expect(
      resolveRequestLocale({ pathname: '/vi/a', cookie: 'en', fallback })
    ).toBe('vi');
    expect(
      resolveRequestLocale({ pathname: '/a', cookie: 'vi', fallback })
    ).toBe('vi');
    expect(
      resolveRequestLocale({
        pathname: '/a',
        cookie: 'fr',
        fallback: () => 'vi',
      })
    ).toBe('vi');
  });
});

describe('preferredRequestLocale', () => {
  it.each([
    ['vi-VN,vi;q=0.9', 'vi'],
    ['en-US,en;q=0.9', 'en'],
    ['fr-FR', 'en'],
    [null, 'en'],
    ['*', 'en'],
    ['not a language!!,vi;q=0.5', 'vi'],
  ])('maps %s to %s', (header, locale) => {
    expect(preferredRequestLocale(header)).toBe(locale);
  });
});
