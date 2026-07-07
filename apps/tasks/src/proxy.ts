import { match } from '@formatjs/intl-localematcher';
import { getBearerAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
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
  getUserConfig,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
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

// Create the centralized auth middleware
// MFA is disabled because satellite apps delegate auth to the web app.
// Sessions here are created via cross-app tokens that already require aal2 on web.
const authProxy = createCentralizedAuthProxy({
  appSession: { sessionMode: 'supabase-first', targetApp: 'tasks' },
  webAppUrl: TTR_URL,
  publicPaths: AUTH_PUBLIC_PATHS,
  skipApiRoutes: true,
  excludeRootPath: true,
  mfa: { enabled: false },
});
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS';
const CORS_HEADERS =
  'authorization,content-type,x-requested-with,x-sdk-client,x-tuturuuu-client';

function getAllowedFirstPartyOrigin(origin: string | null) {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const isFirstPartyHost =
      hostname === 'tuturuuu.com' ||
      hostname.endsWith('.tuturuuu.com') ||
      hostname === 'tuturuuu.localhost' ||
      hostname.endsWith('.tuturuuu.localhost') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';

    return isFirstPartyHost ? url.origin : null;
  } catch {
    return null;
  }
}

function withTaskApiCors(request: NextRequest, response: NextResponse) {
  const allowedOrigin = getAllowedFirstPartyOrigin(
    request.headers.get('origin')
  );

  if (!allowedOrigin) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', CORS_METHODS);
  response.headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('access-control-request-headers') ?? CORS_HEADERS
  );
  response.headers.append('Vary', 'Origin');
  response.headers.append('Vary', 'Access-Control-Request-Headers');

  return response;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith('/api')) {
    if (req.method === 'OPTIONS') {
      return withTaskApiCors(req, new NextResponse(null, { status: 204 }));
    }

    const isLocalAuthApi = req.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const hasBearerAppSession = Boolean(getBearerAppCoordinationToken(req));
    const appSessionRefresh =
      isLocalAuthApi || hasBearerAppSession
        ? null
        : await refreshAppSessionForRequest(req, {
            sessionMode: 'supabase-first',
            targetApp: 'tasks',
          });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return withTaskApiCors(
        req,
        clearSupabaseAuthCookies(
          req,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        )
      );
    }

    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:tasks:api',
    });
    if (guardResponse) {
      if (appSessionRefresh) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return withTaskApiCors(req, clearSupabaseAuthCookies(req, guardResponse));
    }

    return withTaskApiCors(
      req,
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
    targetApp: 'tasks',
  });
  const hasWebAppSession = hasWebAppSessionTokenFromRequest(authRequest);
  const hasSupabaseSession = hasSupportedSupabaseAuthCookie(authRequest);
  const hasSatelliteSession =
    hasSupabaseSession || Boolean(appSession && hasWebAppSession);

  // Handle direct navigation to workspace IDs that are personal workspaces
  // Check if the path matches /[locale]/[wsId] or /[wsId] pattern where wsId is a UUID
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let potentialWorkspaceId: string | null = null;
  let hasLocaleInPath = false;

  const isRootWorkspaceSegment = (segment?: string) =>
    segment?.toLowerCase() === ROOT_WORKSPACE_ID.toLowerCase();
  const loginSegmentIndex =
    pathSegments[0] && supportedLocales.includes(pathSegments[0] as Locale)
      ? 1
      : 0;
  const isLoginPath = pathSegments[loginSegmentIndex] === 'login';

  if (isLoginPath && hasSatelliteSession) {
    const nextPath = normalizeAuthRedirectPath(
      req.nextUrl.searchParams.get('next') ??
        req.nextUrl.searchParams.get('nextUrl'),
      req.nextUrl.origin,
      '/personal/tasks'
    );
    const loginRedirect = clearSupabaseAuthCookies(
      req,
      NextResponse.redirect(new URL(nextPath, req.nextUrl))
    );
    propagateAuthCookies(authRes, loginRedirect);
    return loginRedirect;
  }

  if (pathSegments.length >= 1) {
    // Check if first segment is a locale
    if (
      pathSegments[0] &&
      supportedLocales.includes(pathSegments[0] as Locale)
    ) {
      hasLocaleInPath = true;
      // Check if second segment is a workspace ID
      if (pathSegments.length >= 2 && pathSegments[1]) {
        const candidate = pathSegments[1];
        if (isRootWorkspaceSegment(candidate)) {
          potentialWorkspaceId = ROOT_WORKSPACE_ID;
        } else if (uuidRegex.test(candidate)) {
          potentialWorkspaceId = candidate;
        }
      }
    } else if (pathSegments[0]) {
      // First segment is a workspace ID (no locale in path)
      if (isRootWorkspaceSegment(pathSegments[0])) {
        potentialWorkspaceId = ROOT_WORKSPACE_ID;
      } else if (uuidRegex.test(pathSegments[0])) {
        potentialWorkspaceId = pathSegments[0];
      }
    }
  }

  // Remap root workspace URL to the internal workspace slug for consistency
  if (potentialWorkspaceId === ROOT_WORKSPACE_ID) {
    const wsIdIndex = hasLocaleInPath ? 1 : 0;
    const newPathSegments = [...pathSegments];

    if (newPathSegments[wsIdIndex] !== 'internal') {
      newPathSegments[wsIdIndex] = 'internal';
      const redirectUrl = new URL(`/${newPathSegments.join('/')}`, req.nextUrl);
      redirectUrl.search = req.nextUrl.search;

      const rootRedirect = NextResponse.redirect(redirectUrl);
      propagateAuthCookies(authRes, rootRedirect);
      return rootRedirect;
    }
  }

  // If we found a potential workspace ID, check if it's a personal workspace
  if (potentialWorkspaceId) {
    try {
      if (hasSatelliteSession) {
        const isPersonal = await isPersonalWorkspace(potentialWorkspaceId);

        if (isPersonal) {
          // Construct the redirect URL replacing the workspace ID with 'personal'
          const newPathSegments = [...pathSegments];
          const wsIdIndex = hasLocaleInPath ? 1 : 0;
          newPathSegments[wsIdIndex] = 'personal';

          const redirectUrl = new URL(
            `/${newPathSegments.join('/')}`,
            req.nextUrl
          );
          // Preserve query parameters
          redirectUrl.search = req.nextUrl.search;

          const personalRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, personalRedirect);
          return personalRedirect;
        }
      }
    } catch {
      // Continue with normal flow if personal workspace resolution fails.
    }
  }

  // Handle authenticated users accessing the root path or root with locale
  // Redirect to their default workspace's boards page
  const isRootPath = req.nextUrl.pathname === '/';
  const isLocaleRootPath =
    pathSegments.length === 1 &&
    supportedLocales.includes(pathSegments[0] as Locale);

  const skipWorkspaceRedirect = req.nextUrl.searchParams.has('no-redirect');
  const isHashNavigation = req.nextUrl.searchParams.has('hash-nav');
  const isMultiAccountFlow = req.nextUrl.searchParams.has('multiAccount');

  if (
    (isRootPath || isLocaleRootPath) &&
    !skipWorkspaceRedirect &&
    !isHashNavigation &&
    !isMultiAccountFlow &&
    hasSatelliteSession
  ) {
    try {
      const internalApiAuth = withForwardedInternalApiAuth(authRequestHeaders);
      const config = await getUserConfig(
        'TASKS_FORCE_DEFAULT_WORKSPACE_REDIRECT',
        internalApiAuth
      );

      if (config?.value === 'true') {
        const defaultWorkspace =
          await getCurrentUserDefaultWorkspace(internalApiAuth);

        if (defaultWorkspace) {
          const target = defaultWorkspace.personal
            ? 'personal'
            : defaultWorkspace.id === ROOT_WORKSPACE_ID
              ? 'internal'
              : defaultWorkspace.id;
          const redirectUrl = new URL(`/${target}/tasks`, req.nextUrl);
          const wsRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, wsRedirect);
          return wsRedirect;
        }
      }

      // Default: redirect to personal tasks
      const redirectUrl = new URL('/personal/tasks', req.nextUrl);
      const fallbackRedirect = NextResponse.redirect(redirectUrl);
      propagateAuthCookies(authRes, fallbackRedirect);
      return fallbackRedirect;
    } catch (error) {
      console.error('Error handling root path redirect:', error);
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
