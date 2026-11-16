import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  APP_SESSION_SCOPE,
  APP_SESSION_REFRESH_SCOPE,
} from '@tuturuuu/auth/app-session-core';

export function isExplicitBearerRequest(request: Pick<Request, 'headers'>) {
  return request.headers.has('authorization') && !request.headers.has('cookie');
}

export function rejectsLegacyMountedBearer(request: Pick<Request, 'headers'>) {
  if (!isExplicitBearerRequest(request)) return false;
  const token = getBearerAppCoordinationToken(request);
  if (!token) return false;
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
