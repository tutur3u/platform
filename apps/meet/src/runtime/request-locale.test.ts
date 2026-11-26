import { describe, expect, it } from 'vitest';
import { resolveRequestLocale } from './request-locale';

const request = (path: string, headers: Record<string, string> = {}) => ({
  url: `https://tuturuuu.com${path}`,
  headers: new Headers(headers),
});
const SERVER_FN = '/meet/_meet/functions/page-model';

describe('resolveRequestLocale', () => {
  it('keeps Vietnamese for a server function on an unprefixed URL', () => {
    // After "Lưu tên và tiếp tục" the page model reloads through a server
    // function: no locale segment, an English browser, the /vi cookie.
    expect(
      resolveRequestLocale(
        request(SERVER_FN, {
          'x-tsr-serverfn': 'true',
          'accept-language': 'en-US,en;q=0.9',
          cookie: 'theme=dark; NEXT_LOCALE=vi',
        })
      )
    ).toBe('vi');
  });

  it('prefers the URL segment, then the proxy header, then the cookie', () => {
    const cookie = 'NEXT_LOCALE=vi';
    expect(resolveRequestLocale(request('/en/meet/r/abc', { cookie }))).toBe(
      'en'
    );
    expect(
      resolveRequestLocale(
        request(SERVER_FN, { cookie, 'x-next-intl-locale': 'en' })
      )
    ).toBe('en');
    expect(
      resolveRequestLocale(
        request('/vi/meet/r/abc', { 'x-next-intl-locale': 'en' })
      )
    ).toBe('vi');
    // The mounted app puts its own segment first.
    expect(resolveRequestLocale(request('/meet/vi/r/abc'))).toBe('vi');
    expect(resolveRequestLocale(request('/meet/en/r/abc', { cookie }))).toBe(
      'en'
    );
  });

  it('ignores an unsupported cookie and falls back to Accept-Language', () => {
    expect(
      resolveRequestLocale(
        request(SERVER_FN, {
          cookie: 'NEXT_LOCALE=fr',
          'accept-language': 'fr-FR, vi;q=0.8, en;q=0.5',
        })
      )
    ).toBe('vi');
    expect(
      resolveRequestLocale(
        request(SERVER_FN, { cookie: 'NEXT_LOCALE=<script>' })
      )
    ).toBe('en');
  });

  it('weighs Accept-Language and defaults to English', () => {
    expect(
      resolveRequestLocale(
        request(SERVER_FN, { 'accept-language': 'en;q=0.4, vi-VN;q=0.9' })
      )
    ).toBe('vi');
    expect(
      resolveRequestLocale(request(SERVER_FN, { 'accept-language': 'vi;q=0' }))
    ).toBe('en');
    expect(resolveRequestLocale(request(SERVER_FN))).toBe('en');
  });
});
