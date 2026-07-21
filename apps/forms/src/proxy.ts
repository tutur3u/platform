import { match } from '@formatjs/intl-localematcher';
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
import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
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
const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

// Anonymous respondents fill and submit shared forms with no Tuturuuu session
// at all. `refreshAppSessionForRequest` returns `ok: false` for a request with
// no session credentials, which the /api branch below turns into a 401 — so
// these two public endpoints must skip the refresh entirely unless the caller
// happens to be signed in. Abuse protection for them is Turnstile + rate
// limiting inside the route handlers, not the app session.
const PUBLIC_SHARED_FORM_API_PATTERN = /^\/api\/v1\/shared\/forms\/[^/]+\/?$/u;
const PUBLIC_SHARED_FORM_RESPONSE_COPY_API_PATTERN =
  /^\/api\/v1\/shared\/forms\/[^/]+\/response-copy\/?$/u;

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

function getPreferredLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && supportedLocales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  const headers = {
    'accept-language': request.headers.get('accept-language') ?? defaultLocale,
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

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  if (unlocalizedPath === '/') return null;

  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/**
 * `/f/<shareCode>` is the public form-filling surface. It must stay reachable
 * without any session, including for social/OG crawlers.
 */
function isPublicFormsPath(unlocalizedPath: string) {
  if (unlocalizedPath === '/') return true;
  if (
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token')
  ) {
    return true;
  }

  return unlocalizedPath === '/f' || unlocalizedPath.startsWith('/f/');
}

function isPublicSharedFormApiRequest(request: NextRequest) {
  const method = request.method.toUpperCase();
  const pathname = request.nextUrl.pathname;

  if (
    (method === 'GET' || method === 'HEAD' || method === 'POST') &&
    PUBLIC_SHARED_FORM_API_PATTERN.test(pathname)
  ) {
    return true;
  }

  return (
    method === 'POST' &&
    PUBLIC_SHARED_FORM_RESPONSE_COPY_API_PATTERN.test(pathname)
  );
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
  setLocaleCookie(response, request, pathLocale);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const isPublicSharedFormApi = isPublicSharedFormApiRequest(request);
    const shouldRefreshAppSession =
      !isLocalAuthApi &&
      (!isPublicSharedFormApi || hasApiSessionCredentials(request));
    const appSessionRefresh = shouldRefreshAppSession
      ? await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'forms',
        })
      : null;

    if (appSessionRefresh && !appSessionRefresh.ok && !isPublicSharedFormApi) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:forms:api',
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

  if (!isPublicFormsPath(unlocalizedPath)) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'forms',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'forms',
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
      const next = getNextValue(request);

      if (next) url.searchParams.set('next', next);

      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
    }

    const response = intlMiddleware(request);
    setLocaleCookie(response, request, getPreferredLocale(request));
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return clearSupabaseAuthCookies(request, response);
  }

  const response = intlMiddleware(request);
  setLocaleCookie(response, request, getPreferredLocale(request));
  return clearSupabaseAuthCookies(request, response);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
