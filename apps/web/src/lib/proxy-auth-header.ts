import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import type { NextRequest } from 'next/server';

type ProxyRequest = Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>;

/** Server-to-server app-token exchange; its app secret travels in the body. */
export const APP_TOKEN_EXCHANGE_PATH = '/api/v1/auth/app-token/exchange';

/**
 * Upskii server routes authenticated by `Authorization: Basic` app
 * credentials (`requireUpskiiAppCredentials`: per-IP and per-app limits before
 * the check, paced failures after a wrong secret). POST only, exact paths.
 */
export const UPSKII_BASIC_CREDENTIAL_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/integrations/upskii/introspect',
  '/api/v1/integrations/upskii/link-status',
  '/api/v1/integrations/upskii/unlink',
]);

/** A well-formed `Basic` credential on one of the exact Upskii POST routes. */
export function isUpskiiAppCredentialCall(req: ProxyRequest): boolean {
  if (
    req.method !== 'POST' ||
    !UPSKII_BASIC_CREDENTIAL_PATHS.has(req.nextUrl.pathname)
  ) {
    return false;
  }

  const authHeader = req.headers.get('authorization')?.trim() ?? '';
  return /^basic [A-Za-z0-9+/]+={0,2}$/iu.test(authHeader);
}

export function looksLikeSupabaseJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  return parts.every(
    (part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length > 0
  );
}

export function looksLikeWorkspaceApiKey(token: string): boolean {
  return /^ttr_[A-Za-z0-9_-]+$/.test(token);
}

export function hasMalformedAuthorizationHeader(
  req: Pick<NextRequest, 'headers'>
): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const trimmedHeader = authHeader.trim();
  if (looksLikeWorkspaceApiKey(trimmedHeader)) {
    return false;
  }

  if (!trimmedHeader.toLowerCase().startsWith('bearer ')) {
    return true;
  }

  const token = trimmedHeader.slice(7).trim();
  return token.length === 0 || /\s/.test(token);
}

/**
 * A server-to-server external-app call that may omit a User-Agent: Workers'
 * `fetch` sends none. Only these shapes qualify, and only for the missing-UA
 * heuristic; rate limits and every route check still apply:
 * - a JSON POST to the app-token exchange, which verifies the app secret with
 *   paced failures before doing anything;
 * - a well-formed Basic credential on an exact Upskii app-credential route;
 * - a request carrying a validly signed, unexpired `ttr_app_` bearer. The
 *   signature check is local and cheap; the route still re-checks the app
 *   registry, scopes, workspace binding and membership.
 */
export function isServerToServerAppCall(req: ProxyRequest): boolean {
  if (req.nextUrl.pathname === APP_TOKEN_EXCHANGE_PATH) {
    return (
      req.method === 'POST' &&
      (req.headers.get('content-type') ?? '')
        .toLowerCase()
        .startsWith('application/json')
    );
  }

  if (isUpskiiAppCredentialCall(req)) return true;

  const token = getBearerAppCoordinationToken(req);
  if (!token) return false;

  try {
    return verifyAppCoordinationToken(token).ok;
  } catch {
    return false;
  }
}
