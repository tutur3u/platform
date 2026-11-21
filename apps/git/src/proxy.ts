import { isPublicBuildInfoRequest } from '@tuturuuu/utils/build-info-route';
import {
  getCanonicalLocaleCookieOptions,
  withCanonicalLocaleCookie,
} from '@tuturuuu/auth/locale-cookie';
import {
  clearSupabaseAuthCookies,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  appSessionFailureResponse,
  consumeVerifyTokenRequest,
  createMountedAppAuth,
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;
const LOCALE_COOKIE_ORIGINS = {
  canonicalOrigins: [BASE_URL],
  webAppUrl: WEB_APP_URL,
};

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
    getCanonicalLocaleCookieOptions(
      request,
      LOCALE_COOKIE_ORIGINS,
      LOCALE_COOKIE_OPTIONS
    )
  );
}

function getCanonicalLocaleRedirect(request: NextRequest) {
  const [firstSegment] = request.nextUrl.pathname.split('/').filter(Boolean);
  if (!firstSegment || !supportedLocales.includes(firstSegment as Locale)) {
    return null;
  }

  const url = new URL(request.url);
  url.pathname = withAppBase(
    stripLocale(request.nextUrl.pathname),
    request.nextUrl.basePath
  );

  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, firstSegment as Locale);
  return response;
}

function isProtectedPage(pathname: string) {
  return stripLocale(pathname).startsWith('/-/');
}

const mountedAuth = createMountedAppAuth({ targetApp: 'git' });

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const mounted = mountedAuth.isMounted(request);
  if (request.nextUrl.pathname.startsWith('/api')) {
    if (isPublicBuildInfoRequest(request)) return NextResponse.next();

    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : mounted
        ? await mountedAuth.resolveSession(request)
        : await refreshAppSessionForRequest(request, {
            sessionMode: 'supabase-first',
            targetApp: 'git',
          });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return appSessionFailureResponse(
        request,
        appSessionRefresh.error,
        appSessionRefresh.response
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:git:api',
    });
    if (guardResponse) {
      if (appSessionRefresh?.ok) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return preserveMfaRecoveryCookies(request, guardResponse);
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

  if (mounted) {
    if (
      isProtectedPage(request.nextUrl.pathname) ||
      ['/login', '/verify-token'].includes(
        stripLocale(request.nextUrl.pathname)
      )
    ) {
      const auth = await mountedAuth.auth(request);
      if (auth.status >= 400 || auth.headers.has('location')) return auth;
      const canonical = getCanonicalLocaleRedirect(request);
      const response = canonical ?? intlMiddleware(request);
      propagateAuthCookies(auth, response);
      return response;
    }
    return getCanonicalLocaleRedirect(request) ?? intlMiddleware(request);
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
    const hasSession =
      Boolean(appSession) &&
      (hasWebAppSessionTokenFromRequest(requestWithRefresh) ||
        hasSupportedSupabaseAuthCookie(requestWithRefresh));

    if (!hasSession) {
      const loginUrl = new URL(
        withAppBase('/login', request.nextUrl.basePath),
        request.url
      );
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

const localeProxy = withCanonicalLocaleCookie(
  handleProxy,
  LOCALE_COOKIE_ORIGINS
);

export const config = {
  // Repository paths legitimately contain dots (for example SECURITY.md and
  // turbo.json). Only framework assets, the app favicon, and root metadata
  // bypass locale routing; nested repository files still need it.
  matcher: ['/((?!_next|favicon\\.svg|sitemap\\.xml$|robots\\.txt$).*)'],
};

export async function proxy(request: NextRequest) {
  const response = await localeProxy(request);
  const cookie = response.cookies.get(LOCALE_COOKIE_NAME);
  if (cookie) response.cookies.set({ ...cookie, domain: undefined });
  return response;
}
