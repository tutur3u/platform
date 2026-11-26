import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import {
  handleAuthShellLocale,
  handleLocale,
  handlePrefixedLocale,
} from './locale-proxy';

describe('public marketing locale URLs', () => {
  it.each(['en', 'vi'] as const)(
    'keeps published changelog %s URLs canonical under either language preference',
    (locale) => {
      const pathname = `${locale === 'vi' ? '/vi' : ''}/changelog/synthetic-release`;
      for (const cookieLocale of ['en', 'vi']) {
        for (const language of ['en', 'vi']) {
          const response = handleLocale({
            req: new NextRequest(`https://tuturuuu.com${pathname}`, {
              headers: {
                cookie: `${LOCALE_COOKIE_NAME}=${cookieLocale}`,
                'accept-language': language,
              },
            }),
          });
          expect(response.status).toBe(200);
          expect(response.headers.get('location')).toBeNull();
          expect(
            response.headers.get('x-middleware-request-x-next-intl-locale')
          ).toBe(locale);
          if (locale === 'en')
            expect(response.headers.get('x-middleware-rewrite')).toBe(
              'https://tuturuuu.com/en/changelog/synthetic-release'
            );
        }
      }
    }
  );
  it.each(['/vi', '/vi/products/tasks', '/vi/legal/dpa'])(
    'keeps %s accessible at its Vietnamese canonical URL',
    (pathname) => {
      const response = handleLocale({
        req: new NextRequest(`https://tuturuuu.com${pathname}`, {
          headers: { 'accept-language': 'vi' },
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe('vi');
    }
  );
  it('keeps unprefixed marketing URLs English despite a Vietnamese preference', () => {
    const response = handleLocale({
      req: new NextRequest('https://tuturuuu.com/products/tasks', {
        headers: {
          cookie: `${LOCALE_COOKIE_NAME}=vi`,
          'accept-language': 'vi',
        },
      }),
    });
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://tuturuuu.com/en/products/tasks'
    );
  });
  it('redirects explicit English URLs to the unprefixed canonical', () => {
    const response = handleLocale({
      req: new NextRequest('https://tuturuuu.com/en/products/tasks'),
    });
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/products/tasks'
    );
  });
});

describe('document loads after a language change', () => {
  function documentLoad(pathname: string, headers: Record<string, string>) {
    return handleLocale({
      req: new NextRequest(`https://tuturuuu.com${pathname}`, {
        headers: { 'sec-fetch-dest': 'document', ...headers },
      }),
    });
  }

  it('renders a Vietnamese choice on a public page without rewriting the cookie', () => {
    const response = documentLoad('/vi/products/tasks', {
      cookie: `${LOCALE_COOKIE_NAME}=vi`,
      'accept-language': 'en',
    });
    expect(response.headers.get('location')).toBeNull();
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale')
    ).toBe('vi');
    expect(response.cookies.get(LOCALE_COOKIE_NAME)).toBeUndefined();
  });

  it('keeps System cookie-less when the prefix matches the browser language', () => {
    const response = documentLoad('/vi/products/tasks', {
      'accept-language': 'vi',
    });
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale')
    ).toBe('vi');
    expect(response.cookies.get(LOCALE_COOKIE_NAME)).toBeUndefined();
  });

  it('serves a chosen app-page locale at its unprefixed address', () => {
    const response = documentLoad('/vi/personal/tasks', {
      cookie: `${LOCALE_COOKIE_NAME}=vi`,
    });
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(
      '/personal/tasks'
    );
    expect(response.cookies.get(LOCALE_COOKIE_NAME)).toBeUndefined();
  });
});

describe('prefixed cacheable auth shell URLs', () => {
  it.each([
    ['/vi/login', 'vi'],
    ['/en/login?returnUrl=/en/personal/tasks', 'en'],
    ['/vi/add-account?returnUrl=/vi/personal/tasks', 'vi'],
  ] as const)(
    'propagates %s locale (%s) without redirecting or setting cookies',
    (pathname, expectedLocale) => {
      for (const cookieLocale of [null, 'en', 'vi'] as const) {
        const response = handlePrefixedLocale({
          req: new NextRequest(`https://tuturuuu.com${pathname}`, {
            headers: {
              'accept-language': 'en-US,en;q=0.9',
              ...(cookieLocale
                ? { cookie: `${LOCALE_COOKIE_NAME}=${cookieLocale}` }
                : {}),
            },
          }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(
          response.headers.get('x-middleware-request-x-next-intl-locale')
        ).toBe(expectedLocale);
      }
    }
  );

  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['vi-VN,vi;q=0.9', 'vi'],
  ] as const)(
    'negotiates unprefixed /login (%s -> %s) without writing Set-Cookie for unsupported locale cookies',
    (acceptLanguage, expectedLocale) => {
      const response = handleAuthShellLocale({
        req: new NextRequest('https://tuturuuu.com/login', {
          headers: {
            'accept-language': acceptLanguage,
            cookie: `${LOCALE_COOKIE_NAME}=fr`,
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe(expectedLocale);
      expect(response.headers.get('x-middleware-rewrite')).toBe(
        `https://tuturuuu.com/${expectedLocale}/login`
      );
    }
  );
});
