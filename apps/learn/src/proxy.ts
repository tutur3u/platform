import { match } from '@formatjs/intl-localematcher';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from './constants/common';
import {
  defaultLocale,
  type Locale,
  routing,
  supportedLocales,
} from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

function getPreferredLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && supportedLocales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  const headers = Object.fromEntries(request.headers.entries());
  const languages = new Negotiator({ headers }).languages();
  return match(languages, supportedLocales, defaultLocale) as Locale;
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

function getLoginPath(locale: Locale) {
  return locale === defaultLocale ? '/login' : `/${locale}/login`;
}

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  if (unlocalizedPath === '/') return null;

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function getCanonicalPublicRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);

  if (!unlocalizedPath.startsWith('/login')) return null;

  const url = new URL(request.url);
  let changed = false;

  if (pathLocale === defaultLocale) {
    url.pathname = unlocalizedPath;
    changed = true;
  }

  if (url.searchParams.get('next') === '/') {
    url.searchParams.delete('next');
    changed = true;
  }

  return changed ? NextResponse.redirect(url) : null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:tulearn:api',
    });
    return guardResponse ?? NextResponse.next();
  }

  const canonicalPublicRedirect = getCanonicalPublicRedirect(request);
  if (canonicalPublicRedirect) return canonicalPublicRedirect;

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token');

  if (!isPublicPath) {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      const locale = getPreferredLocale(request);
      const url = new URL(getLoginPath(locale), request.url);
      const next = getNextValue(request);

      if (next) url.searchParams.set('next', next);

      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
