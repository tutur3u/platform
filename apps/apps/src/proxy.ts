import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

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
  response.cookies.set(LOCALE_COOKIE_NAME, pathLocale);
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);

  if (canonicalLocaleRedirect) {
    return canonicalLocaleRedirect;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
