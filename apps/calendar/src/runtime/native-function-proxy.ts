import {
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  hasSupportedSupabaseAuthCookie,
} from '@tuturuuu/auth/app-session';
import {
  appSessionFailureResponse,
  getRequestHeadersWithResponseCookies,
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveCalendarLocale } from './request-locale';

export async function nativeFunctionProxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'POST')
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: 'GET, POST' },
    });
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
  )
    return new NextResponse(null, { status: 415 });
  const hasSession =
    hasSupportedSupabaseAuthCookie(request) ||
    getAppSessionTokenFromRequest(request) ||
    getWebAppSessionTokenFromRequest(request) ||
    getAppSessionRefreshTokenFromRequest(request) ||
    getWebAppSessionRefreshTokenFromRequest(request);
  const session = hasSession
    ? await refreshAppSessionForRequest(request, {
        sessionMode: 'supabase-first',
        targetApp: 'calendar',
      })
    : null;
  if (session && !session.ok)
    return appSessionFailureResponse(request, session.error, session.response);
  const guard = await guardApiProxyRequest(request, {
    prefixBase: 'proxy:calendar:functions',
  });
  if (guard) {
    if (session) propagateAuthCookies(session.response, guard);
    return preserveMfaRecoveryCookies(request, guard);
  }
  const sessionResponse = session?.response ?? NextResponse.next();
  const headers = getRequestHeadersWithResponseCookies(
    request,
    sessionResponse
  );
  headers.set(
    'x-next-intl-locale',
    resolveCalendarLocale({ url: request.url, headers })
  );
  const continuation = NextResponse.next({ request: { headers } });
  for (const [name, value] of sessionResponse.headers)
    if (name !== 'set-cookie' && !name.startsWith('x-middleware-'))
      continuation.headers.set(name, value);
  for (const value of sessionResponse.headers.getSetCookie())
    continuation.headers.append('set-cookie', value);
  return continuation;
}
