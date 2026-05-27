import { match } from '@formatjs/intl-localematcher';
import {
  clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  consumeVerifyTokenRequest,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
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
const LOCAL_AUTH_API_PREFIX = '/api/auth/';

function getPreferredLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && supportedLocales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  const headers = {
    'accept-language':
      request.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };
  const languages = new Negotiator({ headers })
    .languages()
    .flatMap((language) => {
      if (!language || language === '*') {
        return [];
      }

      try {
        const [canonicalLocale] = Intl.getCanonicalLocales(language);

        return canonicalLocale ? [canonicalLocale] : [];
      } catch {
        return [];
      }
    });

  try {
    const matchedLocale = match(
      languages.length > 0 ? languages : [defaultLocale],
      supportedLocales,
      defaultLocale
    );

    return supportedLocales.includes(matchedLocale as Locale)
      ? (matchedLocale as Locale)
      : defaultLocale;
  } catch {
    return defaultLocale;
  }
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

function getLoginPath() {
  return '/login';
}

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  if (unlocalizedPath === '/') return null;

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function getCanonicalPublicRedirect(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);

  if (unlocalizedPath !== '/') return null;

  const url = new URL(request.url);
  let changed = false;

  if (url.searchParams.get('next') === '/') {
    url.searchParams.delete('next');
    changed = true;
  }

  return changed ? NextResponse.redirect(url) : null;
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  if (!pathLocale) return null;

  const url = new URL(request.url);
  url.pathname = stripLocale(request.nextUrl.pathname);

  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE_NAME, pathLocale);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(request, {
          targetApp: 'teach',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:teach:api',
    });
    if (guardResponse) {
      if (appSessionRefresh) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return clearSupabaseAuthCookies(request, guardResponse);
    }

    return (
      appSessionRefresh?.response ??
      clearSupabaseAuthCookies(request, NextResponse.next())
    );
  }

  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);
  if (canonicalLocaleRedirect) {
    return clearSupabaseAuthCookies(request, canonicalLocaleRedirect);
  }

  const canonicalPublicRedirect = getCanonicalPublicRedirect(request);
  if (canonicalPublicRedirect) {
    return clearSupabaseAuthCookies(request, canonicalPublicRedirect);
  }

  const verifyTokenResponse = await consumeVerifyTokenRequest(request, {
    locales: supportedLocales,
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath === '/' ||
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token');

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      targetApp: 'teach',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'teach',
        });
    const hasWebAppSession =
      hasWebAppSessionTokenFromRequest(requestWithRefresh);

    if (!appSession || !hasWebAppSession) {
      const url = new URL(getLoginPath(), request.url);
      const next = getNextValue(request);

      if (next) url.searchParams.set('next', next);

      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
    }

    const response = intlMiddleware(request);
    response.cookies.set(LOCALE_COOKIE_NAME, getPreferredLocale(request));
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
  }

  const response = intlMiddleware(request);
  response.cookies.set(LOCALE_COOKIE_NAME, getPreferredLocale(request));
  return clearSupabaseAuthCookies(request, response);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
