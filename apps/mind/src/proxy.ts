import {
  clearSupabaseAuthCookies,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  appSessionFailureResponse,
  consumeVerifyTokenRequest,
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
  resolveCanonicalRequestOrigin,
} from '@tuturuuu/auth/proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME, WEB_APP_URL } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';
import { createMindPublicUrl } from './lib/mind-public-url';

const intlMiddleware = createIntlMiddleware(routing);
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

/**
 * Mind's canonical origin for locale cookies, never the raw `Host` or an
 * unproven `X-Forwarded-Host` header, so a hostile host header cannot pick the
 * cookie's scope or downgrade it to a non-secure cookie.
 */
function getLocaleCookieOrigin(request: NextRequest) {
  return (
    resolveCanonicalRequestOrigin(request, WEB_APP_URL, [BASE_URL]) ?? BASE_URL
  );
}

function isSecureOrigin(origin: string) {
  return origin.startsWith('https:');
}

/**
 * The locale redirect cookie keeps the shared-cookie helper's scope for mind's
 * canonical origin and is `Secure` whenever that origin is `https`.
 */
function setLocaleCookie(
  response: NextResponse,
  request: NextRequest,
  locale: string
) {
  const cookieOrigin = getLocaleCookieOrigin(request);
  const cookieOptions = getTuturuuuSharedCookieOptions(
    LOCALE_COOKIE_OPTIONS,
    cookieOrigin
  );
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    ...cookieOptions,
    ...(isSecureOrigin(cookieOrigin) ? { secure: true } : {}),
  });
}

/**
 * next-intl's middleware writes `NEXT_LOCALE` itself (for example when the
 * request has no `Accept-Language` or an invalid locale cookie). That cookie
 * stays host-only with next-intl's value, `Path`, `Max-Age`/`Expires` and
 * `SameSite`; `Secure` follows mind's canonical origin.
 */
function runIntlMiddleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const localeCookie = response.cookies.get(LOCALE_COOKIE_NAME);
  if (!localeCookie) return response;

  const { domain: _domain, name: _name, ...cookieOptions } = localeCookie;
  response.cookies.set({
    ...cookieOptions,
    name: LOCALE_COOKIE_NAME,
    secure: isSecureOrigin(getLocaleCookieOrigin(request)),
  });
  return response;
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

  const url = createMindPublicUrl(
    `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`,
    request
  );

  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, pathLocale);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
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
      isLocalAuthApi || isBuildInfoRead
        ? null
        : await refreshAppSessionForRequest(request, {
            sessionMode: 'supabase-first',
            targetApp: 'mind',
          });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return appSessionFailureResponse(
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
      return preserveMfaRecoveryCookies(request, guardResponse);
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
    unlocalizedPath.startsWith('/verify-token');

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'mind',
    });
    if (
      !appSessionRefresh.ok &&
      (appSessionRefresh.error === 'App session refresh unavailable' ||
        appSessionRefresh.error === 'MFA required' ||
        appSessionRefresh.error === 'Account assurance unavailable')
    ) {
      return appSessionFailureResponse(
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

    const response = runIntlMiddleware(request);
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
  }

  return clearSupabaseAuthCookies(request, runIntlMiddleware(request));
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
