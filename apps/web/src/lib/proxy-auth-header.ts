import type { NextRequest } from 'next/server';

type ProxyRequest = Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>;

/**
 * The shape of an app-coordination bearer: `ttr_app_<header>.<claims>.<sig>`,
 * each base64url, with an HMAC-SHA256 signature (43 characters). The prefix is
 * case-sensitive like the verifier's. Structural only: the proxy never
 * verifies or trusts it.
 */
const APP_BEARER_SHAPE =
  /^[Bb]earer ttr_app_[A-Za-z0-9_-]{16,256}\.[A-Za-z0-9_-]{16,4096}\.[A-Za-z0-9_-]{43}$/u;

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
  '/api/v1/integrations/upskii/live-class',
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

  // The same shape `readBasicAppCredentials` parses, so the proxy never
  // refuses a header the route would accept.
  const authHeader = req.headers.get('authorization')?.trim() ?? '';
  return /^Basic\s+[A-Za-z0-9+/=]{1,512}$/u.test(authHeader);
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
 * heuristic, which any caller can already pass by sending a User-Agent. It
 * grants no authentication or scope: rate limits, the query/scanner rules and
 * every route check still apply.
 * - a JSON POST to the app-token exchange, which verifies the app secret with
 *   paced failures before doing anything;
 * - a well-formed Basic credential on an exact Upskii app-credential route;
 * - a bearer shaped like an app-coordination token. Shape only: verifying it
 *   here would add a token consumer (see the reviewed list in
 *   `packages/utils/src/app-coordination-token-consumers.test.ts`) without
 *   protecting anything, and each route verifies it, including the link-only
 *   bearers only `/integrations/upskii/link` accepts.
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

  return APP_BEARER_SHAPE.test(req.headers.get('authorization')?.trim() ?? '');
}
