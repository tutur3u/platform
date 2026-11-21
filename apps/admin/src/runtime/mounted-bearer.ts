import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  APP_SESSION_SCOPE,
  APP_SESSION_REFRESH_SCOPE,
} from '@tuturuuu/auth/app-session-core';
import { NextResponse } from 'next/server';

export function isExplicitBearerRequest(request: Pick<Request, 'headers'>) {
  return request.headers.has('authorization') && !request.headers.has('cookie');
}

/**
 * Whether the mount refuses this cookie-less Authorization. Only a verified
 * app coordination token without a browser app-session scope is admitted; a
 * provider JWT, Basic credential or anything else would bypass the shared
 * session refresh, logout fence and MFA checks that browser requests pass.
 */
export function refusesMountedAuthorization(request: Pick<Request, 'headers'>) {
  if (!isExplicitBearerRequest(request)) return false;
  const token = getBearerAppCoordinationToken(request);
  if (!token) return true;
  try {
    const result = verifyAppCoordinationToken(token);
    return (
      !result.ok ||
      result.claims.scopes.some(
        (scope) =>
          scope === APP_SESSION_SCOPE || scope === APP_SESSION_REFRESH_SCOPE
      )
    );
  } catch {
    return true;
  }
}

/** The mounted Authorization refusal: no cookie is written or cleared. */
export function mountedAuthorizationRefusal() {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
  );
}
