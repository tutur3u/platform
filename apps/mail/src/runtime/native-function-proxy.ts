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
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { nativeMethodStatus } from './mail-api-policy';

export async function nativeFunctionProxy(request: NextRequest) {
  const status = nativeMethodStatus(
    request.method,
    request.headers.get('content-type')
  );
  if (status !== 200)
    return new NextResponse(null, {
      status,
      headers: status === 405 ? { Allow: 'GET, POST' } : undefined,
    });
  const hasSession =
    hasSupportedSupabaseAuthCookie(request) ||
    getAppSessionTokenFromRequest(request) ||
    getWebAppSessionTokenFromRequest(request) ||
    getAppSessionRefreshTokenFromRequest(request) ||
    getWebAppSessionRefreshTokenFromRequest(request);
  const session = hasSession
    ? await refreshAppSessionForRequest(request, {
        sessionMode: 'supabase-first',
        targetApp: 'mail',
      })
    : null;
  if (session && !session.ok)
    return appSessionFailureResponse(request, session.error, session.response);
  const guard = await guardApiProxyRequest(request, {
    prefixBase: 'proxy:mail:functions',
  });
  if (guard) {
    if (session) propagateAuthCookies(session.response, guard);
    return preserveMfaRecoveryCookies(request, guard);
  }
  return session?.response ?? NextResponse.next();
}
