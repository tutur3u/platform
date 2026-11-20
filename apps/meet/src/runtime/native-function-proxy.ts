import {
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  hasSupportedSupabaseAuthCookie,
} from '@tuturuuu/auth/app-session';
import {
  appSessionFailureResponse,
  preserveMfaRecoveryCookies,
  propagateAuthCookies,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { mountedSessionFailureResponse } from '@tuturuuu/auth/proxy/mounted-failure';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
  const mounted = Boolean(request.nextUrl.basePath);
  const hasSession =
    hasSupportedSupabaseAuthCookie(request) ||
    getAppSessionTokenFromRequest(request) ||
    getWebAppSessionTokenFromRequest(request) ||
    getAppSessionRefreshTokenFromRequest(request) ||
    getWebAppSessionRefreshTokenFromRequest(request);
  const session = hasSession
    ? await refreshAppSessionForRequest(request, {
        sessionMode: mounted ? 'supabase-only' : 'supabase-first',
        targetApp: 'meet',
      })
    : null;
  if (session && !session.ok)
    return mounted
      ? mountedSessionFailureResponse(request, session.error, session.response)
      : appSessionFailureResponse(request, session.error, session.response);
  const guard = await guardApiProxyRequest(request, {
    prefixBase: 'proxy:meet:functions',
  });
  if (guard) {
    if (session) propagateAuthCookies(session.response, guard);
    return preserveMfaRecoveryCookies(request, guard);
  }
  return session?.response ?? NextResponse.next();
}
