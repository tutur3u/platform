import { match } from '@formatjs/intl-localematcher';
import {
  clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest,
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  consumeVerifyTokenRequest,
  createCentralizedAuthProxy,
  getRequestHeadersWithResponseCookies,
  normalizeAuthRedirectPath,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import {
  getCurrentUserDefaultWorkspace,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE_NAME, PUBLIC_PATHS, TTR_URL } from './constants/common';
import { defaultLocale, type Locale, supportedLocales } from './i18n/routing';

const AUTH_PUBLIC_PATHS = [
  ...PUBLIC_PATHS,
  '/login',
  ...supportedLocales.map((locale) => `/${locale}/login`),
];
const LEGACY_PLAN_ID_PATTERN = /^[0-9a-f]{32}$/iu;

function getPathSegments(pathname: string) {
  return pathname.split('/').filter(Boolean);
}

function isLocaleSegment(segment: string | undefined): segment is Locale {
  return Boolean(segment && supportedLocales.includes(segment as Locale));
}

function getPathSegmentsWithoutLocale(pathname: string) {
  const segments = getPathSegments(pathname);
  return isLocaleSegment(segments[0]) ? segments.slice(1) : segments;
}

function isPublicLegacyPlanPath(pathname: string) {
  const segments = getPathSegmentsWithoutLocale(pathname);
  return (
    segments.length === 1 &&
    typeof segments[0] === 'string' &&
    LEGACY_PLAN_ID_PATTERN.test(segments[0])
  );
}

function isRootPathOrLocaleRoot(pathname: string) {
  const segments = getPathSegments(pathname);
  return (
    segments.length === 0 ||
    (segments.length === 1 && isLocaleSegment(segments[0]))
  );
}

// Create the centralized auth middleware
// MFA is disabled because satellite apps delegate auth to the web app.
// Sessions here are created via cross-app tokens that already require aal2 on web.
const authProxy = createCentralizedAuthProxy({
  appSession: { sessionMode: 'supabase-first', targetApp: 'meet' },
  webAppUrl: TTR_URL,
  publicPaths: AUTH_PUBLIC_PATHS,
  skipApiRoutes: true,
  excludeRootPath: true,
  isPublicPath: isPublicLegacyPlanPath,
  mfa: { enabled: false },
});
const LOCAL_AUTH_API_PREFIX = '/api/auth/';

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = req.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(req, {
          sessionMode: 'supabase-first',
          targetApp: 'meet',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        req,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:meet:api',
    });
    if (guardResponse) {
      if (appSessionRefresh) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return clearSupabaseAuthCookies(req, guardResponse);
    }

    return (
      appSessionRefresh?.response ??
      clearSupabaseAuthCookies(req, NextResponse.next())
    );
  }

  const verifyTokenResponse = await consumeVerifyTokenRequest(req, {
    locales: supportedLocales,
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  // Handle authentication and MFA with the centralized middleware
  const authRes = await authProxy(req);

  // If the auth middleware returned a redirect response, return it
  if (authRes.headers.has('Location')) {
    return authRes;
  }

  const authRequestHeaders = getRequestHeadersWithResponseCookies(req, authRes);
  const authRequest = { headers: authRequestHeaders };
  const appSession = getAppSessionClaimsFromRequest(authRequest, {
    targetApp: 'meet',
  });
  const hasWebAppSession = hasWebAppSessionTokenFromRequest(authRequest);
  const hasSupabaseSession = hasSupportedSupabaseAuthCookie(authRequest);
  const hasSatelliteSession =
    hasSupabaseSession || Boolean(appSession && hasWebAppSession);
  const pathSegments = getPathSegments(req.nextUrl.pathname);
  const loginSegmentIndex = isLocaleSegment(pathSegments[0]) ? 1 : 0;
  const isLoginPath = pathSegments[loginSegmentIndex] === 'login';

  if (isLoginPath && hasSatelliteSession) {
    const nextPath = normalizeAuthRedirectPath(
      req.nextUrl.searchParams.get('next') ??
        req.nextUrl.searchParams.get('nextUrl'),
      req.nextUrl.origin,
      '/'
    );
    const loginRedirect = clearSupabaseAuthCookies(
      req,
      NextResponse.redirect(new URL(nextPath, req.nextUrl))
    );
    propagateAuthCookies(authRes, loginRedirect);
    return loginRedirect;
  }

  if (isRootPathOrLocaleRoot(req.nextUrl.pathname) && hasSatelliteSession) {
    try {
      const defaultWorkspace = await getCurrentUserDefaultWorkspace(
        withForwardedInternalApiAuth(authRequestHeaders)
      );
      const target = defaultWorkspace?.personal
        ? 'personal'
        : defaultWorkspace?.id === ROOT_WORKSPACE_ID
          ? 'internal'
          : (defaultWorkspace?.id ?? 'personal');
      const wsRedirect = NextResponse.redirect(
        new URL(`/workspace/${target}/plans`, req.nextUrl)
      );
      propagateAuthCookies(authRes, wsRedirect);
      return wsRedirect;
    } catch (error) {
      console.error('Error handling Meet root path redirect:', error);
    }
  }

  // Continue with locale handling
  const localeRes = handleLocale({ req });
  propagateAuthCookies(authRes, localeRes);
  return localeRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (SEO)
     * - sitemap.xml (SEO)
     * - site.webmanifest (SEO)
     * - monitoring (analytics)
     * Excludes files with the following extensions for static assets:
     * - svg
     * - png
     * - jpg
     * - jpeg
     * - pdf
     * - gif
     * - webp
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|monitoring|.*\\.(?:svg|png|jpg|jpeg|pdf|gif|webp)$).*)',
  ],
};

const getSupportedLocale = (locale: string): Locale | null => {
  return supportedLocales.includes(locale as Locale)
    ? (locale as Locale)
    : null;
};

const getExistingLocale = (
  req: NextRequest
): {
  locale: Locale | null;
  cookie: string | null;
  pathname: string | null;
} => {
  // Get raw locale from pathname and cookie
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')[1] || '';
  const rawRocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';

  // Get supported locale from pathname and cookie
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawRocaleFromCookie);

  const locale = localeFromPathname || localeFromCookie;

  return {
    locale,
    cookie: localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (
  req: NextRequest
): {
  locale: Locale;
} => {
  // Get browser languages
  const headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const languages = new Negotiator({ headers }).languages();
  const detectedLocale = match(languages, supportedLocales, defaultLocale);

  return {
    locale: supportedLocales.includes(detectedLocale as Locale)
      ? (detectedLocale as Locale)
      : defaultLocale,
  };
};

const getLocale = (
  req: NextRequest
): {
  locale: string;
  cookie: string | null;
  pathname: string | null;
  default: boolean;
} => {
  // Get locale from pathname and cookie
  const { locale: existingLocale, cookie, pathname } = getExistingLocale(req);

  // If locale is found, return it
  if (existingLocale) {
    return {
      locale: existingLocale,
      cookie,
      pathname,
      default: false,
    };
  }

  // If locale is not found, return default locale
  const { locale: defaultLocale } = getDefaultLocale(req);

  return {
    locale: defaultLocale,
    cookie,
    pathname,
    default: true,
  };
};

const handleLocale = ({ req }: { req: NextRequest }): NextResponse => {
  // Get locale from cookie or browser languages
  const { locale } = getLocale(req);

  const nextIntlMiddleware = createIntlMiddleware({
    locales: supportedLocales,
    defaultLocale: locale as Locale,
    localeDetection: false,
    localePrefix: 'as-needed',
  });

  return nextIntlMiddleware(req);
};
