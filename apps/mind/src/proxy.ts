import {
  getCanonicalLocaleCookieOptions,
  withCanonicalLocaleCookie,
} from '@tuturuuu/auth/locale-cookie';
import {
  clearSupabaseAuthCookies as clearRootSupabaseAuthCookies,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  appSessionFailureResponse,
  consumeVerifyTokenRequest,
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import {
  mountedSessionFailureResponse,
  nonExpiringCookieCarrier,
} from '@tuturuuu/auth/proxy/mounted-failure';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME, WEB_APP_URL } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';
import { createMindPublicUrl } from './lib/mind-public-url';
import {
  isExplicitBearerRequest,
  mountedAuthorizationRefusal,
  refusesMountedAuthorization,
} from './runtime/mounted-bearer';

const intlMiddleware = createIntlMiddleware(routing);
const MOUNTED_LOCALE_COOKIE_NAME = 'mind_locale';
const mountedIntlMiddleware = createIntlMiddleware({
  ...routing,
  localeCookie: {
    name: MOUNTED_LOCALE_COOKIE_NAME,
    path: '/mind',
    secure: true,
    sameSite: 'lax',
  },
});

function isMounted(request: NextRequest) {
  return request.nextUrl.basePath === '/mind';
}

function browserSessionMode(request: NextRequest) {
  return isMounted(request) && !isExplicitBearerRequest(request)
    ? 'supabase-only'
    : 'supabase-first';
}

// The mount shares the apex with Web, whose provider cookies Mind never clears.
function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse
) {
  return isMounted(request)
    ? response
    : clearRootSupabaseAuthCookies(request, response);
}

function sessionFailureResponse(
  request: NextRequest,
  error: string,
  refreshed?: Response
) {
  return isMounted(request)
    ? mountedSessionFailureResponse(request, error, refreshed)
    : appSessionFailureResponse(request, error, refreshed);
}

function localeResponse(request: NextRequest) {
  return isMounted(request)
    ? mountedIntlMiddleware(request)
    : intlMiddleware(request);
}
const LOCAL_AUTH_API_PATHS = new Set([
  '/api/auth/logout',
  '/api/auth/refresh-app-session',
  '/api/auth/verify-app-token',
]);
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;
const LOCALE_COOKIE_ORIGINS = {
  canonicalOrigins: [BASE_URL],
  webAppUrl: WEB_APP_URL,
};

function setLocaleCookie(
  response: NextResponse,
  request: NextRequest,
  locale: string
) {
  if (isMounted(request)) {
    response.cookies.set(MOUNTED_LOCALE_COOKIE_NAME, locale, {
      maxAge: LOCALE_COOKIE_OPTIONS.maxAge,
      path: '/mind',
      sameSite: 'lax',
      secure: true,
    });
    return;
  }
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

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  if (unlocalizedPath === '/') return null;

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  if (!pathLocale) return null;

  let url: URL;
  try {
    url = createMindPublicUrl(
      `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`,
      request
    );
  } catch {
    // A path that cannot stay inside the app base lands on its root.
    url = createMindPublicUrl('/', request);
  }

  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, pathLocale);
  return response;
}

async function routeProxy(request: NextRequest): Promise<NextResponse> {
  if (isMounted(request)) {
    if (refusesMountedAuthorization(request))
      return mountedAuthorizationRefusal();
    request.headers.delete('x-next-intl-locale');
    const locale = request.cookies.get(MOUNTED_LOCALE_COOKIE_NAME)?.value;
    if (locale && supportedLocales.some((supported) => supported === locale)) {
      request.headers.set('x-next-intl-locale', locale);
    }
  }
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = LOCAL_AUTH_API_PATHS.has(request.nextUrl.pathname);
    const isBuildInfoRead =
      request.nextUrl.pathname === '/api/build-info' &&
      (request.method === 'GET' || request.method === 'HEAD');
    if (isBuildInfoRead) {
      for (const cookie of request.cookies.getAll())
        request.cookies.delete(cookie.name);
      request.headers.delete('cookie');
      request.headers.delete('authorization');
    }
    const appSessionRefresh =
      isLocalAuthApi ||
      isBuildInfoRead ||
      (isMounted(request) && isExplicitBearerRequest(request))
        ? null
        : await refreshAppSessionForRequest(request, {
            sessionMode: browserSessionMode(request),
            targetApp: 'mind',
          });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return sessionFailureResponse(
        request,
        appSessionRefresh.error,
        appSessionRefresh.response
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:mind:api',
    });
    if (guardResponse) {
      if (appSessionRefresh) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return isMounted(request)
        ? guardResponse
        : preserveMfaRecoveryCookies(request, guardResponse);
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
    ...(isMounted(request)
      ? {
          mountedSession: {
            mode: 'supabase-only',
            targetApp: 'mind',
            webAppUrl: WEB_APP_URL,
          },
        }
      : {}),
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token');

  if (isMounted(request) && isPublicPath) {
    const session = await refreshAppSessionForRequest(request, {
      sessionMode: 'supabase-only',
      targetApp: 'mind',
    });
    if (!session.ok && session.error !== 'Shared session unavailable') {
      return sessionFailureResponse(request, session.error, session.response);
    }
    const response = localeResponse(request);
    propagateAuthCookies(
      session.ok
        ? session.response
        : nonExpiringCookieCarrier(session.response),
      response
    );
    return response;
  }

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: isMounted(request) ? 'supabase-only' : 'supabase-first',
      targetApp: 'mind',
    });
    if (
      !appSessionRefresh.ok &&
      (appSessionRefresh.error === 'App session refresh unavailable' ||
        appSessionRefresh.error === 'MFA required' ||
        appSessionRefresh.error === 'Account assurance unavailable')
    ) {
      return sessionFailureResponse(
        request,
        appSessionRefresh.error,
        appSessionRefresh.response
      );
    }
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok ? appSessionRefresh.claims : null;
    const hasWebAppSession =
      hasWebAppSessionTokenFromRequest(requestWithRefresh);
    const hasSupabaseSession =
      hasSupportedSupabaseAuthCookie(requestWithRefresh);
    const hasSatelliteSession = Boolean(
      appSession && (hasWebAppSession || hasSupabaseSession)
    );

    if (!hasSatelliteSession) {
      const url = createMindPublicUrl('/login', request);
      const next = getNextValue(request);
      if (next) url.searchParams.set('next', next);
      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
    }

    const response = localeResponse(request);
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
  }

  return clearSupabaseAuthCookies(request, localeResponse(request));
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const response = await routeProxy(request);
  // Every mounted response is personalised or an auth or locale redirect on
  // the shared apex, so no browser or edge cache may store it.
  if (isMounted(request))
    response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

// Only NEXT_LOCALE is rescoped; the mount writes mind_locale at /mind instead.
export const proxy = withCanonicalLocaleCookie(
  handleProxy,
  LOCALE_COOKIE_ORIGINS
);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
