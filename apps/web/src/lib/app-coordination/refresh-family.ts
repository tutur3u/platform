import { randomUUID } from 'node:crypto';

/**
 * External-app refresh tokens carry their rotation family as a scope, so a
 * family survives each single-use rotation without a new token claim or table.
 * Reusing a rotated token revokes the whole family in the replay store.
 */
export const APP_TOKEN_REFRESH_SCOPE = 'app-token:refresh';
const FAMILY_SCOPE_PREFIX = 'app-token:family:';
const FAMILY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function newRefreshFamily() {
  return randomUUID();
}

export function refreshTokenScopes(family: string) {
  return [APP_TOKEN_REFRESH_SCOPE, `${FAMILY_SCOPE_PREFIX}${family}`];
}

/** The family of a refresh token, or null for tokens issued without one. */
export function readRefreshFamily(scopes: readonly string[]) {
  for (const scope of scopes) {
    if (!scope.startsWith(FAMILY_SCOPE_PREFIX)) continue;
    const family = scope.slice(FAMILY_SCOPE_PREFIX.length);
    return FAMILY_ID_PATTERN.test(family) ? family : null;
  }
  return null;
}
