import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import {
  getLocaleCookieOptions,
  withSecureLocaleCookie,
} from '@tuturuuu/utils/locale-cookie';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

function setLocaleCookie(response: NextResponse, locale: string) {
  response.cookies.set(
    LOCALE_COOKIE_NAME,
    locale,
    getLocaleCookieOptions(LOCALE_COOKIE_OPTIONS, BASE_URL)
  );
}

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale =
    firstSegment && supportedLocales.includes(firstSegment as Locale);
  return `/${segments.slice(hasLocale ? 1 : 0).join('/')}`;
}

function getPathLocale(pathname: string) {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  return firstSegment && supportedLocales.includes(firstSegment as Locale)
    ? (firstSegment as Locale)
    : null;
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);

  if (!pathLocale) {
    return null;
  }

  const url = new URL(request.url);
  url.pathname = withAppBase(
    stripLocale(request.nextUrl.pathname),
    request.nextUrl.basePath
  );
  const response = NextResponse.redirect(url);
  setLocaleCookie(response, pathLocale);
  return response;
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:tools:api',
    });

    return guardResponse ?? NextResponse.next();
  }

  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);

  if (canonicalLocaleRedirect) {
    return canonicalLocaleRedirect;
  }

  const response = intlMiddleware(request);
  if (
    request.method === 'GET' &&
    request.nextUrl.origin === 'https://tuturuuu.com' &&
    request.nextUrl.basePath === '/tools' &&
    request.nextUrl.pathname === '/' &&
    response.cookies.getAll().length === 1 &&
    response.cookies.has(LOCALE_COOKIE_NAME)
  ) {
    // The public entry detects locale for this response without storing it.
    const headers = new Headers(response.headers);
    headers.delete('set-cookie');
    headers.delete('x-middleware-set-cookie');
    return new NextResponse(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
  return response;
}

export const proxy = withSecureLocaleCookie(handleProxy, () => BASE_URL);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
