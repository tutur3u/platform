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
import type { ProxyRoutePolicy } from '@tuturuuu/utils/api-proxy-guard';
import {
  guardApiProxyRequest,
  hasAuthenticatedBearerToken,
} from '@tuturuuu/utils/api-proxy-guard';
import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const ROUTE_AUTH_CRON_API_PREFIX = '/api/cron/';
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;
const PUBLIC_STOREFRONT_API_PATTERN =
  /^\/api\/v1\/inventory\/storefronts\/[^/]+\/?$/u;
const PUBLIC_STOREFRONT_ANALYTICS_API_PATTERN =
  /^\/api\/v1\/inventory\/storefronts\/[^/]+\/analytics\/events\/?$/u;
const PUBLIC_ORDER_API_PATTERN = /^\/api\/v1\/inventory\/orders\/[^/]+\/?$/u;
const PUBLIC_POLAR_WEBHOOK_API_PATTERN =
  /^\/api\/v1\/inventory\/polar\/webhook\/[^/]+\/?$/u;
const PUBLIC_SQUARE_WEBHOOK_API_PATTERN =
  /^\/api\/v1\/inventory\/square\/webhook(?:\/[^/]+)?\/?$/u;
const PUBLIC_SQUARE_POS_CALLBACK_API_PATTERN =
  /^\/api\/v1\/inventory\/square\/pos\/callback\/?$/u;
const INVENTORY_SALES_API_PATTERN =
  /^\/api\/v1\/workspaces\/[^/]+\/inventory\/sales(?:\/|$)/u;
const INVENTORY_PRODUCT_CRUD_API_PATTERN =
  /^\/api\/v1\/workspaces\/[^/]+\/products\/[^/]+(?:\/inventory)?\/?$/u;
const INVENTORY_SALES_ROUTE_POLICY = {
  key: 'inventory-sales',
  matches: (request: NextRequest) =>
    INVENTORY_SALES_API_PATTERN.test(request.nextUrl.pathname),
  rateLimits: {
    get: [],
    mutate: [
      { duration: '1 m', limit: 60, window: 'minute' },
      { duration: '1 h', limit: 600, window: 'hour' },
      { duration: '1 d', limit: 5000, window: 'day' },
    ],
  },
} satisfies ProxyRoutePolicy;
const INVENTORY_PRODUCT_CRUD_ROUTE_POLICY = {
  key: 'inventory-product-crud',
  matches: (request: NextRequest) =>
    INVENTORY_PRODUCT_CRUD_API_PATTERN.test(request.nextUrl.pathname),
  rateLimits: {
    get: [],
    mutate: [
      { duration: '1 m', limit: 180, window: 'minute' },
      { duration: '1 h', limit: 1200, window: 'hour' },
      { duration: '1 d', limit: 10_000, window: 'day' },
    ],
  },
} satisfies ProxyRoutePolicy;

function setLocaleCookie(
  response: NextResponse,
  request: NextRequest,
  locale: string
) {
  response.cookies.set(
    LOCALE_COOKIE_NAME,
    locale,
    getTuturuuuSharedCookieOptions(LOCALE_COOKIE_OPTIONS, request)
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

function getNextValue(request: NextRequest) {
  // The root page resolves the default workspace in a single hop, so send the
  // user straight back to `/` after login instead of routing through
  // `/dashboard` (which would re-introduce the extra redirect).
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);

  return `${unlocalizedPath}${request.nextUrl.search}`;
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  if (!pathLocale) return null;

  const url = new URL(request.url);
  url.pathname = stripLocale(request.nextUrl.pathname);

  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, pathLocale);
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

  if (method === 'POST' && PUBLIC_POLAR_WEBHOOK_API_PATTERN.test(pathname)) {
    return true;
  }

  if (method === 'POST' && PUBLIC_SQUARE_WEBHOOK_API_PATTERN.test(pathname)) {
    return true;
  }

  if (
    (method === 'GET' || method === 'POST') &&
    PUBLIC_SQUARE_POS_CALLBACK_API_PATTERN.test(pathname)
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
    const isRouteAuthCronApi = request.nextUrl.pathname.startsWith(
      ROUTE_AUTH_CRON_API_PREFIX
    );
    const hasBearerApiSession = hasAuthenticatedBearerToken(request.headers);
    const isPublicStorefrontApi = isPublicStorefrontApiRequest(request);
    const shouldRefreshAppSession =
      !isLocalAuthApi &&
      !isRouteAuthCronApi &&
      !hasBearerApiSession &&
      (!isPublicStorefrontApi || hasApiSessionCredentials(request));
    const appSessionRefresh = shouldRefreshAppSession
      ? await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'inventory',
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
      additionalRoutePolicies: [
        INVENTORY_SALES_ROUTE_POLICY,
        INVENTORY_PRODUCT_CRUD_ROUTE_POLICY,
      ],
      prefixBase: 'proxy:inventory:api',
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
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/store') ||
    unlocalizedPath.startsWith('/verify-token');

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'inventory',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'inventory',
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
