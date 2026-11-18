import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';

/**
 * True when the bearer was minted before the app's current secret was issued.
 * Bearers do not carry the secret, so a rotation revokes them here; refresh
 * needs the current secret, so a client holding it mints a fresh bearer.
 * A missing `secretIssuedAt` means no secret was ever issued, so nothing to
 * compare; an unreadable one fails closed.
 */
export function wasIssuedBeforeSecretRotation(
  claims: Pick<AppCoordinationTokenClaims, 'iat'>,
  secretIssuedAt: string | null
) {
  if (!secretIssuedAt) return false;

  const secretIssuedAtMs = Date.parse(secretIssuedAt);
  if (!Number.isFinite(secretIssuedAtMs) || typeof claims.iat !== 'number') {
    return true;
  }

  // `iat` has whole-second precision; compare at the same precision so a
  // bearer minted in the rotation's second, after it, stays valid.
  return claims.iat < Math.floor(secretIssuedAtMs / 1000);
}
