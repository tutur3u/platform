import { type NextRequest, NextResponse } from 'next/server';
import { resolveCanonicalRequestOrigin } from './canonical-origin';
import {
  normalizeAuthRedirectPath,
  withRequestBasePath,
} from './redirect-path';

/**
 * Central login URL for a signed-out request. The return URL is omitted when
 * the app has no valid canonical origin, so a header value is never reflected.
 */
export function buildCentralLoginUrl(
  req: NextRequest,
  webAppUrl: string,
  canonicalOrigins: readonly string[]
): URL {
  const loginUrl = new URL('/login', webAppUrl);
  const returnUrl = buildCentralizedReturnUrl(req, webAppUrl, canonicalOrigins);
  if (returnUrl) {
    loginUrl.searchParams.set('returnUrl', returnUrl);
  }
  return loginUrl;
}

export function authRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function buildCentralizedReturnUrl(
  req: NextRequest,
  webAppUrl: string,
  canonicalOrigins: readonly string[],
  rawTargetPath?: string | null
): string | null {
  const publicOrigin = resolveCanonicalRequestOrigin(
    req,
    webAppUrl,
    canonicalOrigins
  );
  if (!publicOrigin) {
    return null;
  }
  const normalizedTargetPath = normalizeAuthRedirectPath(
    rawTargetPath ?? `${req.nextUrl.pathname}${req.nextUrl.search}`,
    publicOrigin,
    '/'
  );
  const verifyUrl = new URL(
    withRequestBasePath(req, '/verify-token'),
    publicOrigin
  );
  verifyUrl.searchParams.set('nextUrl', normalizedTargetPath);
  return verifyUrl.toString();
}
