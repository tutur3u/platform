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
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
  withRequestBasePath,
} from '@tuturuuu/auth/proxy';
import { mountedSessionFailureResponse } from '@tuturuuu/auth/proxy/mounted-failure';
import {
  guardApiProxyRequest,
  hasAuthenticatedBearerToken,
  isTrustedProxyBypassRequest,
} from '@tuturuuu/utils/api-proxy-guard';
import { getAppBasePath, SHARED_APP_ORIGIN } from '@tuturuuu/utils/app-mounts';
import { GUARD_REASON_HEADER } from '@tuturuuu/utils/guard-rejection';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME, WEB_APP_URL } from './constants/common';
import { type Locale, routing, supportedLocales } from './i18n/routing';
import {
  calendarPreferenceBlockDiagnostic,
  calendarPreferenceGuardPrefix,
  isCalendarPreferenceRequest,
} from './lib/mobile-calendar/preference-guard';
import {
  isExplicitBearerRequest,
  mountedAuthorizationRefusal,
  refusesMountedAuthorization,
} from './runtime/mounted-bearer';

const intlMiddleware = createIntlMiddleware(routing);
const ADMIN_BASE_PATH = getAppBasePath('infra');
const LOCAL_AUTH_API_PREFIX = '/api/auth/';
const MIRA_OPERATOR_API_PREFIX = '/api/v1/infrastructure/mira/';
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

function getCanonicalLocaleRedirect(request: NextRequest) {
  const pathLocale = getPathLocale(request.nextUrl.pathname);

  if (!pathLocale) {
    return null;
  }

  const url = new URL(
    withRequestBasePath(
      request,
      `${stripLocale(request.nextUrl.pathname)}${request.nextUrl.search}`
    ),
    request.url
  );
  const response = NextResponse.redirect(url);
  setLocaleCookie(response, request, pathLocale);
  return response;
}

function getNextValue(request: NextRequest) {
  const unlocalizedPath = stripLocale(request.nextUrl.pathname);
  return `${unlocalizedPath}${request.nextUrl.search}`;
}

function isPublicAuthPath(pathname: string) {
  const unlocalizedPath = stripLocale(pathname);
  return (
    unlocalizedPath.startsWith('/login') ||
    unlocalizedPath.startsWith('/verify-token')
  );
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  const mounted = request.nextUrl.origin === SHARED_APP_ORIGIN;
  if (mounted && request.nextUrl.basePath !== ADMIN_BASE_PATH) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  const sessionOptions = {
    sessionMode: mounted ? 'supabase-only' : 'supabase-first',
    targetApp: 'infra',
  } as const;
  const finish = (response: NextResponse) =>
    mounted ? response : clearSupabaseAuthCookies(request, response);
  const sessionFailure = mounted
    ? mountedSessionFailureResponse
    : appSessionFailureResponse;

  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const isBuildInfoRead =
      request.nextUrl.pathname === '/api/build-info' &&
      (request.method === 'GET' || request.method === 'HEAD');
    // The apex admits only a verified coordination bearer without cookies; a
    // provider JWT there would skip the provider-only session and MFA checks.
    if (mounted && refusesMountedAuthorization(request)) {
      return mountedAuthorizationRefusal();
    }
    // Mira operator routes take only the Admin cookie session. A client
    // Authorization header would skip the session refresh and its MFA,
    // sign-out and ban checks, so the only bearer these routes ever see is the
    // one the refresh below attaches.
    if (
      request.nextUrl.pathname.startsWith(MIRA_OPERATOR_API_PREFIX) &&
      request.headers.has('authorization')
    ) {
      return mountedAuthorizationRefusal();
    }
    const hasBearerApiSession = mounted
      ? isExplicitBearerRequest(request)
      : hasAuthenticatedBearerToken(request.headers);
    // Scheduler credentials authenticate independently of browser sessions.
    // Keep the shared guard and route-level secret checks in place.
    const hasTrustedCron =
      request.nextUrl.pathname.startsWith('/api/cron/') &&
      isTrustedProxyBypassRequest(request.nextUrl.pathname, request.headers);
    const appSessionRefresh =
      isLocalAuthApi || isBuildInfoRead || hasBearerApiSession || hasTrustedCron
        ? null
        : await refreshAppSessionForRequest(request, sessionOptions);

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return sessionFailure(
        request,
        appSessionRefresh.error,
        appSessionRefresh.response
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: calendarPreferenceGuardPrefix(request),
      ...(isCalendarPreferenceRequest(request)
        ? {
            useVerifiedBearerActor: true,
            diagnosticPolicyName: 'native-calendar-preferences',
          }
        : {}),
    });

    if (guardResponse) {
      if (
        guardResponse.status === 429 &&
        !guardResponse.headers.has(GUARD_REASON_HEADER) &&
        isCalendarPreferenceRequest(request)
      ) {
        console.warn(
          'Calendar preference gateway blocked',
          calendarPreferenceBlockDiagnostic(guardResponse.headers)
        );
      }
      if (appSessionRefresh?.ok) {
        propagateAuthCookies(appSessionRefresh.response, guardResponse);
      }

      return isBuildInfoRead || mounted
        ? guardResponse
        : preserveMfaRecoveryCookies(request, guardResponse);
    }

    if (isBuildInfoRead) return NextResponse.next();

    return appSessionRefresh?.ok
      ? appSessionRefresh.response
      : finish(NextResponse.next());
  }

  const verifyTokenResponse = await consumeVerifyTokenRequest(request, {
    locales: supportedLocales,
    ...(mounted
      ? {
          mountedSession: {
            mode: 'supabase-only',
            nextUrlScope: 'app-relative',
            targetApp: 'infra',
            webAppUrl: SHARED_APP_ORIGIN,
          },
        }
      : {}),
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const canonicalLocaleRedirect = getCanonicalLocaleRedirect(request);
  if (canonicalLocaleRedirect) {
    return finish(canonicalLocaleRedirect);
  }

  const isPublicPath = isPublicAuthPath(request.nextUrl.pathname);

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      ...sessionOptions,
      requireWebAppSession: !mounted,
    });
    if (
      !appSessionRefresh.ok &&
      (appSessionRefresh.error === 'App session refresh unavailable' ||
        appSessionRefresh.error === 'MFA required' ||
        appSessionRefresh.error === 'Account assurance unavailable')
    ) {
      return sessionFailure(
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
      !mounted && hasWebAppSessionTokenFromRequest(requestWithRefresh);
    const hasSupabaseSession =
      hasSupportedSupabaseAuthCookie(requestWithRefresh);
    const hasSatelliteSession = Boolean(
      appSession && (hasWebAppSession || hasSupabaseSession)
    );

    if (!hasSatelliteSession) {
      const url = new URL(withRequestBasePath(request, '/login'), request.url);
      url.searchParams.set('next', getNextValue(request));

      return finish(NextResponse.redirect(url));
    }

    const response = intlMiddleware(request);
    if (appSessionRefresh.ok) {
      propagateAuthCookies(appSessionRefresh.response, response);
    }
    return finish(response);
  }

  return finish(intlMiddleware(request));
}

export const proxy = withCanonicalLocaleCookie(
  handleProxy,
  LOCALE_COOKIE_ORIGINS
);

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
