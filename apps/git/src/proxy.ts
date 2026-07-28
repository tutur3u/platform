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
import { routing, supportedLocales } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);
const LOCAL_AUTH_API_PREFIX = '/api/auth/';

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] && supportedLocales.includes(segments[0] as never)) {
    segments.shift();
  }
  return `/${segments.join('/')}`;
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
  matcher: ['/((?!_next|.*\\..*).*)'],
};
