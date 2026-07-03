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
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { type Locale, routing, supportedLocales } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale =
    firstSegment && supportedLocales.includes(firstSegment as Locale);

  return `/${segments.slice(hasLocale ? 1 : 0).join('/')}`;
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

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith('/api')) {
    const isLocalAuthApi = request.nextUrl.pathname.startsWith(
      LOCAL_AUTH_API_PREFIX
    );
    const appSessionRefresh = isLocalAuthApi
      ? null
      : await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: 'infra',
        });

    if (appSessionRefresh && !appSessionRefresh.ok) {
      return clearSupabaseAuthCookies(
        request,
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const guardResponse = await guardApiProxyRequest(request, {
      prefixBase: 'proxy:infra:api',
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

  const verifyTokenResponse = await consumeVerifyTokenRequest(request, {
    locales: supportedLocales,
  });
  if (verifyTokenResponse) {
    return verifyTokenResponse;
  }

  const isPublicPath = isPublicAuthPath(request.nextUrl.pathname);

  if (!isPublicPath) {
    const appSessionRefresh = await refreshAppSessionForRequest(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
    const requestWithRefresh = {
      headers: appSessionRefresh.ok
        ? (appSessionRefresh.requestHeaders ?? request.headers)
        : request.headers,
    };
    const appSession = appSessionRefresh.ok
      ? appSessionRefresh.claims
      : getAppSessionClaimsFromRequest(requestWithRefresh, {
          targetApp: 'infra',
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
      url.searchParams.set('next', getNextValue(request));

      return clearSupabaseAuthCookies(request, NextResponse.redirect(url));
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
  matcher: ['/((?!_next|.*\\..*).*)'],
};
