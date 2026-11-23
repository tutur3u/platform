import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { handleLocale } from './locale-proxy';

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
