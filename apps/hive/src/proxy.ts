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
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';
import { createHivePublicUrl } from './lib/hive-public-url';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PATHS = new Set([
  '/api/auth/logout',
  '/api/auth/refresh-app-session',
  '/api/auth/verify-app-token',
]);

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

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  if (unlocalizedPath === '/') return null;

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  if (!pathLocale) return null;

  const url = createHivePublicUrl(
    `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`,
    request
  );

  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE_NAME, pathLocale);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = LOCAL_AUTH_API_PATHS.has(request.nextUrl.pathname);
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(request, {
          targetApp: 'hive',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:hive:api',
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

  const verifyTokenResponse = await consumeVerifyTokenRequest(request, {
    locales: supportedLocales,
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token') ||
    unlocalizedPath.startsWith('/~recover-browser-state');

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      targetApp: 'hive',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'hive',
        });
    const hasWebAppSession =
      hasWebAppSessionTokenFromRequest(requestWithRefresh);

    if (!appSession || !hasWebAppSession) {
      const url = createHivePublicUrl('/login', request);
      const next = getNextValue(request);
      if (next) url.searchParams.set('next', next);
      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
    }

    const response = intlMiddleware(request);
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
  }

  return clearSupabaseAuthCookies(request, intlMiddleware(request));
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
