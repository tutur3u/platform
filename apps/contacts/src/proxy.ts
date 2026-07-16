import { match } from '@formatjs/intl-localematcher';
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
import {
  guardApiProxyRequest,
  hasAuthenticatedBearerToken,
} from '@tuturuuu/utils/api-proxy-guard';
import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from './constants/common';
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

/**
 * Contacts only ships a subset of the `/[wsId]` dashboard surface; every other
 * workspace route is still owned by apps/web. Redirect those to web instead of
 * returning a 404.
 *
 * This MUST live in the middleware rather than a `[wsId]/[...catchAll]` page.
 * A catch-all page route also matches `/api/v1/...` as locale="api", wsId="v1",
 * and — because Next checks `fallback` rewrites only AFTER dynamic routes — it
 * would shadow the `/api/:path*` → web proxy and break every proxied API call.
 * The middleware handles `/api` in an earlier branch, so it is never affected.
 */
// Exact routes contacts owns. These must NOT prefix-match: `users` is the users
// index, and treating it as a prefix would mark every /users/* path owned —
// including non-migrated ones like /users/groups, which would then 404 here
// instead of redirecting to web.
const CONTACTS_OWNED_EXACT_ROUTES = new Set(['', 'users']);

// Route roots contacts owns, including anything nested beneath them.
// `*` matches exactly one dynamic segment (e.g. a userId).
// Add an entry here whenever a module is migrated, or the middleware will bounce
// the freshly-migrated route straight back to web.
const CONTACTS_OWNED_ROUTE_PREFIXES = [
  'posts',
  'workforce',
  'users/approvals',
  'users/attendance',
  'users/database',
  'users/feedbacks',
  'users/group-tags',
  'users/groups',
  'users/guest-leads',
  'users/reports',
  'users/structure',
  'users/topic-announcements',
  'users/tutoring',
  'users/*/follow-up',
];

const CONTACTS_NON_WORKSPACE_SEGMENTS = new Set([
  'dashboard',
  'login',
  'verify-token',
]);

function matchesRoutePrefix(pattern: string, segments: string[]) {
  const patternSegments = pattern.split('/');
  if (segments.length < patternSegments.length) return false;

  return patternSegments.every(
    (patternSegment, index) =>
      patternSegment === '*' || patternSegment === segments[index]
  );
}

function getNonMigratedWorkspaceRedirect(request: NextRequest) {
  const segments = stripLocale(request.nextUrl.pathname)
    .split('/')
    .filter(Boolean);

  const wsId = segments[0];
  if (!wsId || CONTACTS_NON_WORKSPACE_SEGMENTS.has(wsId)) return null;

  const subSegments = segments.slice(1);
  const subPath = subSegments.join('/');

  if (CONTACTS_OWNED_EXACT_ROUTES.has(subPath)) return null;
  if (
    CONTACTS_OWNED_ROUTE_PREFIXES.some((pattern) =>
      matchesRoutePrefix(pattern, subSegments)
    )
  ) {
    return null;
  }

  return NextResponse.redirect(
    new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, WEB_APP_URL)
  );
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
  setLocaleCookie(response, request, pathLocale);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const hasBearerApiSession = hasAuthenticatedBearerToken(request.headers);
    const appSessionRefresh =
      isLocalAuthApi || hasBearerApiSession
        ? null
        : await refreshAppSessionForRequest(request, {
            sessionMode: 'supabase-first',
            targetApp: 'contacts',
          });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:contacts:api',
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
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'contacts',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'contacts',
        });
    const hasWebAppSession =
      hasWebAppSessionTokenFromRequest(requestWithRefresh);
    const hasSupabaseSession =
      hasSupportedSupabaseAuthCookie(requestWithRefresh);
    const hasSatelliteSession = Boolean(
      appSession && (hasWebAppSession || hasSupabaseSession)
    );

    if (!hasSatelliteSession) {
      const url = new URL(getLoginPath(), request.url);
      const next = getNextValue(request);

      if (next) url.searchParams.set('next', next);

      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
    }

    const nonMigratedRedirect = getNonMigratedWorkspaceRedirect(request);
    if (nonMigratedRedirect) {
      if (appSessionRefresh.ok) {
        propagateAuthCookies(appSessionRefresh.response, nonMigratedRedirect);
      }
      return clearSupabaseAuthCookies(request, nonMigratedRedirect);
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
