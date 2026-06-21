import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
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

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const PUBLIC_STOREFRONT_API_PATTERN =
  /^\/api\/v1\/inventory\/storefronts\/[^/]+\/?$/u;
const PUBLIC_STOREFRONT_ANALYTICS_API_PATTERN =
  /^\/api\/v1\/inventory\/storefronts\/[^/]+\/analytics\/events\/?$/u;
const PUBLIC_ORDER_API_PATTERN = /^\/api\/v1\/inventory\/orders\/[^/]+\/?$/u;

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
  if (unlocalizedPath === '/') return '/demo';

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function isPublicStorefrontPath(unlocalizedPath: string) {
  if (unlocalizedPath === '/') return true;
  if (unlocalizedPath === '/orders') return false;
  if (
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token')
  ) {
    return true;
  }

  const segments = unlocalizedPath.split('/').filter(Boolean);

  if (segments[0] === 'store') {
    const [, , childPath, publicToken] = segments;
    if (childPath === 'checkout') return false;
    if (childPath === 'orders' && !publicToken) return false;
    return true;
  }

  const [, childPath, publicToken] = segments;
  if (childPath === 'checkout') return false;
  if (childPath === 'orders' && !publicToken) return false;

  return true;
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

function hasCookie(request: NextRequest, name: string) {
  return Boolean(request.cookies.get(name)?.value);
}

function hasApiSessionCredentials(request: NextRequest) {
  return (
    hasSupportedSupabaseAuthCookie(request) ||
    hasWebAppSessionTokenFromRequest(request) ||
    hasCookie(request, APP_SESSION_COOKIE_NAME) ||
    hasCookie(request, WEB_APP_SESSION_COOKIE_NAME) ||
    hasCookie(request, APP_SESSION_REFRESH_COOKIE_NAME) ||
    hasCookie(request, WEB_APP_SESSION_REFRESH_COOKIE_NAME)
  );
}

function isPublicStorefrontApiRequest(request: NextRequest) {
  const method = request.method.toUpperCase();
  const pathname = request.nextUrl.pathname;

  if (method === 'GET' && PUBLIC_STOREFRONT_API_PATTERN.test(pathname)) {
    return true;
  }

  if (
    method === 'POST' &&
    PUBLIC_STOREFRONT_ANALYTICS_API_PATTERN.test(pathname)
  ) {
    return true;
  }

  return method === 'GET' && PUBLIC_ORDER_API_PATTERN.test(pathname);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const isPublicStorefrontApi = isPublicStorefrontApiRequest(request);
    const shouldRefreshAppSession =
      !isLocalAuthApi &&
      (!isPublicStorefrontApi || hasApiSessionCredentials(request));
    const appSessionRefresh = shouldRefreshAppSession
      ? await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'storefront',
        })
      : null;

    if (appSessionRefresh && !appSessionRefresh.ok) {
      if (!isPublicStorefrontApi) {
        return clearSupabaseAuthCookies(
          request,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        );
      }
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:storefront:api',
    });

    if (guardResponse) {
      if (appSessionRefresh?.ok) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return clearSupabaseAuthCookies(request, guardResponse);
    }

    return appSessionRefresh?.ok
      ? appSessionRefresh.response
      : clearSupabaseAuthCookies(request, NextResponse.next());
  }

  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);
  if (canonicalLocaleRedirect) {
    return clearSupabaseAuthCookies(request, canonicalLocaleRedirect);
  }

  const verifyTokenResponse = await consumeVerifyTokenRequest(request, {
    locales: supportedLocales,
  });
  if (verifyTokenResponse) return verifyTokenResponse;

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath = isPublicStorefrontPath(unlocalizedPath);

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'storefront',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'storefront',
        });
    const hasWebAppSession =
      hasWebAppSessionTokenFromRequest(requestWithRefresh);
    const hasSupabaseSession =
      hasSupportedSupabaseAuthCookie(requestWithRefresh);
    const hasSatelliteSession = Boolean(
      appSession && (hasWebAppSession || hasSupabaseSession)
    );

    if (!hasSatelliteSession) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', getNextValue(request));

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
