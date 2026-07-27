import {
  clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  consumeVerifyTokenRequest,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';
import { createAiPublicUrl } from './lib/ai-public-url';

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

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale =
    firstSegment && supportedLocales.includes(firstSegment as Locale);
  return `/${segments.slice(hasLocale ? 1 : 0).join('/')}`;
}

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

function getCanonicalLocaleRedirect(request: NextRequest) {
  const [firstSegment] = request.nextUrl.pathname.split('/').filter(Boolean);
  if (!firstSegment || !supportedLocales.includes(firstSegment as Locale)) {
    return null;
  }

  const url = createAiPublicUrl(
    `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`,
    request
  );
  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, firstSegment);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Public AI endpoints authenticate exclusively with hash-only ttr_ai_ keys
  // or scoped, registered external-app tokens. They never inherit or refresh a
  // human browser session, but still pass the shared API abuse guard before
  // credential verification and workspace-level rate enforcement.
  if (request.nextUrl.pathname.startsWith('/v1/')) {
    return (
      (await guardApiProxyRequest(request, {
        prefixBase: 'proxy:ai:public',
      })) ?? NextResponse.next()
    );
  }

  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = LOCAL_AUTH_API_PATHS.has(request.nextUrl.pathname);
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'ai',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:ai:api',
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
  if (verifyTokenResponse) return verifyTokenResponse;

  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  const isPublicPath =
    unlocalizedPath.startsWith('/auth-error') ||
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token');

  if (isPublicPath) {
    return clearSupabaseAuthCookies(request, intlMiddleware(request));
  }

  const appSessionRefresh = await refreshAppSessionForRequest(request, {
    requireWebAppSession: true,
    sessionMode: 'supabase-first',
    targetApp: 'ai',
  });
  const requestWithRefresh = {
    headers: appSessionRefresh.ok
      ? (appSessionRefresh.requestHeaders ?? request.headers)
      : request.headers,
  };
  const appSession = appSessionRefresh.ok
    ? appSessionRefresh.claims
    : getAppSessionClaimsFromRequest(requestWithRefresh, { targetApp: 'ai' });
  const hasSatelliteSession = Boolean(
    appSession &&
      (hasWebAppSessionTokenFromRequest(requestWithRefresh) ||
        hasSupportedSupabaseAuthCookie(requestWithRefresh))
  );

  if (!hasSatelliteSession) {
    const url = createAiPublicUrl('/login', request);
    if (unlocalizedPath !== '/') {
      url.searchParams.set(
        'next',
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
    }
    return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
  }

  const response = intlMiddleware(request);
  if (appSessionRefresh.ok) {
    propagateAuthCookies(appSessionRefresh.response, response);
  }
  return clearSupabaseAuthCookies(request, response);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
