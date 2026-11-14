import {
  getCanonicalLocaleCookieOptions,
  withCanonicalLocaleCookie,
} from '@tuturuuu/auth/locale-cookie';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
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
const LOCALE_COOKIE_ORIGINS = {
  canonicalOrigins: [BASE_URL],
};

function setLocaleCookie(
  response: NextResponse,
  request: NextRequest,
  locale: string
) {
  response.cookies.set(
    LOCALE_COOKIE_NAME,
    locale,
    getCanonicalLocaleCookieOptions(
      request,
      LOCALE_COOKIE_ORIGINS,
      LOCALE_COOKIE_OPTIONS
    )
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

  const url = new URL(
    `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`,
    request.url
  );
  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, pathLocale);
  return response;
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:apps:api',
    });

    return guardResponse ?? NextResponse.next();
  }

  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);

  if (canonicalLocaleRedirect) {
    return canonicalLocaleRedirect;
  }

  return intlMiddleware(request);
}

export const proxy = withCanonicalLocaleCookie(
  handleProxy,
  LOCALE_COOKIE_ORIGINS
);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
