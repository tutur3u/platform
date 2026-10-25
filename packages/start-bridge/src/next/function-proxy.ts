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
import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { maybeBridgeRequest } from '../server/request-context';

export interface FunctionProxyOptions {
  /** App-session audience, e.g. `meet`. */
  targetApp: Parameters<typeof refreshAppSessionForRequest>[1]['targetApp'];
  /** Rate-limit prefix; defaults to `proxy:<app>:functions`. */
  prefixBase?: string;
  /** Customises the continuation after a refreshed session (e.g. locale). */
  continueWith?: (
    request: NextRequest,
    sessionResponse: NextResponse
  ) => NextResponse;
}

/**
 * Middleware for the server-function base: GET or JSON POST only, refreshes
 * an existing app session (supabase-first), then applies the API proxy guard.
 * Requests with no session cookie are not refreshed. Mounted requests (a
 * non-empty base resolved by the bridge from the URL) use the shared apex
 * session, so they are never refreshed and never write app-session cookies.
 */
export function createFunctionProxy(options: FunctionProxyOptions) {
  const prefixBase =
    options.prefixBase ?? `proxy:${options.targetApp}:functions`;
  return async function functionProxy(request: NextRequest) {
    if (request.method !== 'GET' && request.method !== 'POST')
      return new NextResponse(null, {
        status: 405,
        headers: { Allow: 'GET, POST' },
      });
    if (
      request.method === 'POST' &&
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      return new NextResponse(null, { status: 415 });
    // The URL-derived base from the bridge request context; never a header.
    const mounted = Boolean(maybeBridgeRequest()?.appBase);
    const hasSession =
      !mounted &&
      (hasSupportedSupabaseAuthCookie(request) ||
      getAppSessionTokenFromRequest(request) ||
      getWebAppSessionTokenFromRequest(request) ||
      getAppSessionRefreshTokenFromRequest(request) ||
        getWebAppSessionRefreshTokenFromRequest(request));
    const session = hasSession
      ? await refreshAppSessionForRequest(request, {
          sessionMode: 'supabase-first',
          targetApp: options.targetApp,
        })
      : null;
    if (session && !session.ok)
      return appSessionFailureResponse(
        request,
        session.error,
        session.response
      );
    const guard = await guardApiProxyRequest(request, { prefixBase });
    if (guard) {
      if (session) propagateAuthCookies(session.response, guard);
      return preserveMfaRecoveryCookies(request, guard);
    }
    const response = session?.response ?? NextResponse.next();
    return options.continueWith
      ? options.continueWith(request, response)
      : response;
  };
}
