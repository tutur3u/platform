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
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] && supportedLocales.includes(segments[0] as Locale)) {
    segments.shift();
  }
  return `/${segments.join('/')}`;
}

function setLocaleCookie(
  response: NextResponse,
  request: NextRequest,
  locale: Locale
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

  const url = new URL(request.url);
  url.pathname = stripLocale(request.nextUrl.pathname);

  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, firstSegment as Locale);
  return response;
}

function isProtectedPage(pathname: string) {
  return stripLocale(pathname).startsWith('/-/');
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'git',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:git:api',
    });
    if (guardResponse) {
      if (appSessionRefresh?.ok) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return clearSupabaseAuthCookies(request, guardResponse);
    }

    if (isLocalAuthApi) {
      return clearSupabaseAuthCookies(request, NextResponse.next());
    }

    const apiUrl = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      WEB_APP_URL
    );
    const response = NextResponse.rewrite(apiUrl, {
      request: {
        headers: appSessionRefresh?.ok
          ? (appSessionRefresh.requestHeaders ?? request.headers)
          : request.headers,
      },
    });
    if (appSessionRefresh?.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
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

  if (isProtectedPage(request.nextUrl.pathname)) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'git',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'git',
        });
    const hasSession =
      Boolean(appSession) &&
      (hasWebAppSessionTokenFromRequest(requestWithRefresh) ||
        hasSupportedSupabaseAuthCookie(requestWithRefresh));

    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set(
        'next',
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return clearSupabaseAuthCookies(request, NextResponse.redirect(loginUrl));
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
  // Repository paths legitimately contain dots (for example SECURITY.md and
  // turbo.json), so only framework assets and the app favicon bypass locale
  // routing.
  matcher: ['/((?!_next|favicon\\.svg).*)'],
};
