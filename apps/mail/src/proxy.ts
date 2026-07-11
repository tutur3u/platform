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
  '/not-available',
  ...supportedLocales.map((locale) => `/${locale}/not-available`),
];

const authProxy = createCentralizedAuthProxy({
  appSession: { sessionMode: 'supabase-first', targetApp: 'mail' },
  excludeRootPath: true,
  mfa: { enabled: false },
  publicPaths: AUTH_PUBLIC_PATHS,
  skipApiRoutes: true,
  webAppUrl: TTR_URL,
});
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const SIGNED_PROVIDER_WEBHOOK_PATHS = new Set([
  '/api/v1/webhooks/mail/cloudflare',
  '/api/v1/webhooks/mail/ses',
]);
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

function withMailApiCors(request: NextRequest, response: NextResponse) {
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
      return withMailApiCors(req, new NextResponse(null, { status: 204 }));
    }

    if (SIGNED_PROVIDER_WEBHOOK_PATHS.has(req.nextUrl.pathname)) {
      return NextResponse.next();
    }

    const isLocalAuthApi = req.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(req, {
          sessionMode: 'supabase-first',
          targetApp: 'mail',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return withMailApiCors(
        req,
        clearSupabaseAuthCookies(
          req,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        )
      );
    }

    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:mail:api',
    });
    if (guardResponse) {
      if (appSessionRefresh) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }
      return withMailApiCors(req, clearSupabaseAuthCookies(req, guardResponse));
    }

    return withMailApiCors(
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

  const authRes = await authProxy(req);

  if (authRes.headers.has('Location')) {
    return authRes;
  }

  const authRequestHeaders = getRequestHeadersWithResponseCookies(req, authRes);
  const authRequest = { headers: authRequestHeaders };
  const appSession = getAppSessionClaimsFromRequest(authRequest, {
    targetApp: 'mail',
  });
  const hasWebAppSession = hasWebAppSessionTokenFromRequest(authRequest);
  const hasSupabaseSession = hasSupportedSupabaseAuthCookie(authRequest);
  const hasSatelliteSession =
    hasSupabaseSession || Boolean(appSession && hasWebAppSession);
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
      '/personal'
    );
    const loginRedirect = clearSupabaseAuthCookies(
      req,
      NextResponse.redirect(new URL(nextPath, req.nextUrl))
    );
    propagateAuthCookies(authRes, loginRedirect);
    return loginRedirect;
  }

  if (pathSegments.length >= 1) {
    if (
      pathSegments[0] &&
      supportedLocales.includes(pathSegments[0] as Locale)
    ) {
      hasLocaleInPath = true;
      const candidate = pathSegments[1];
      if (isRootWorkspaceSegment(candidate)) {
        potentialWorkspaceId = ROOT_WORKSPACE_ID;
      } else if (candidate && uuidRegex.test(candidate)) {
        potentialWorkspaceId = candidate;
      }
    } else if (pathSegments[0]) {
      if (isRootWorkspaceSegment(pathSegments[0])) {
        potentialWorkspaceId = ROOT_WORKSPACE_ID;
      } else if (uuidRegex.test(pathSegments[0])) {
        potentialWorkspaceId = pathSegments[0];
      }
    }
  }

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

  if (potentialWorkspaceId && hasSatelliteSession) {
    try {
      const personal = await isPersonalWorkspace(potentialWorkspaceId);

      if (personal) {
        const newPathSegments = [...pathSegments];
        const wsIdIndex = hasLocaleInPath ? 1 : 0;
        newPathSegments[wsIdIndex] = 'personal';

        const redirectUrl = new URL(
          `/${newPathSegments.join('/')}`,
          req.nextUrl
        );
        redirectUrl.search = req.nextUrl.search;

        const personalRedirect = NextResponse.redirect(redirectUrl);
        propagateAuthCookies(authRes, personalRedirect);
        return personalRedirect;
      }
    } catch {
      // Keep the request on the original workspace path if the lookup fails.
    }
  }

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
      const defaultWorkspace = await getCurrentUserDefaultWorkspace(
        withForwardedInternalApiAuth(authRequestHeaders)
      );
      const target = defaultWorkspace
        ? defaultWorkspace.personal
          ? 'personal'
          : defaultWorkspace.id === ROOT_WORKSPACE_ID
            ? 'internal'
            : defaultWorkspace.id
        : 'personal';
      const redirectUrl = new URL(`/${target}`, req.nextUrl);
      const wsRedirect = NextResponse.redirect(redirectUrl);
      propagateAuthCookies(authRes, wsRedirect);
      return wsRedirect;
    } catch {
      const fallbackRedirect = NextResponse.redirect(
        new URL('/personal', req.nextUrl)
      );
      propagateAuthCookies(authRes, fallbackRedirect);
      return fallbackRedirect;
    }
  }

  const localeRes = handleLocale({ req });
  propagateAuthCookies(authRes, localeRes);
  return localeRes;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.webmanifest|sw.js|serwist|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|mp3|wav|ogg|m4a|pdf|gif|webp)$).*)',
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
  cookie: string | null;
  locale: Locale | null;
  pathname: string | null;
} => {
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')[1] || '';
  const rawLocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawLocaleFromCookie);

  return {
    cookie: localeFromCookie,
    locale: localeFromPathname || localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (req: NextRequest): { locale: Locale } => {
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
  cookie: string | null;
  default: boolean;
  locale: string;
  pathname: string | null;
} => {
  const { cookie, locale: existingLocale, pathname } = getExistingLocale(req);

  if (existingLocale) {
    return {
      cookie,
      default: false,
      locale: existingLocale,
      pathname,
    };
  }

  const { locale } = getDefaultLocale(req);

  return {
    cookie,
    default: true,
    locale,
    pathname,
  };
};

const handleLocale = ({ req }: { req: NextRequest }): NextResponse => {
  const { locale } = getLocale(req);

  const nextIntlMiddleware = createIntlMiddleware({
    defaultLocale: locale as Locale,
    localeDetection: false,
    localePrefix: 'as-needed',
    locales: supportedLocales,
  });

  return nextIntlMiddleware(req);
};
