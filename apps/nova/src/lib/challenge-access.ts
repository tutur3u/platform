import {
  createSignedAccessToken,
  type SignedAccessTokenOptions,
  verifySignedAccessToken,
} from '@tuturuuu/utils/signed-access-token';

/**
 * Access grants for password-protected Nova challenges.
 *
 * After the challenge password verifies, the server sets an httpOnly cookie
 * holding a signed grant bound to the challenge and the signed-in user. The
 * stored password hash is never sent to the browser.
 */

export const CHALLENGE_ACCESS_PURPOSE = 'nova-challenge-access';
/** Cookie that held password material before signed grants; always cleared. */
export const LEGACY_CHALLENGE_ACCESS_COOKIE = 'token';
const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_ID_PATTERN = /[^A-Za-z0-9-]/gu;

export function challengeAccessCookieName(challengeId: string) {
  return `nova_challenge_access_${challengeId.replace(COOKIE_ID_PATTERN, '')}`;
}

export function challengeAccessTtlSeconds(duration: unknown) {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return DEFAULT_TTL_SECONDS;
  }
  const seconds = Math.floor(duration);
  if (seconds <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(seconds, MAX_TTL_SECONDS);
}

export function createChallengeAccessGrant(
  input: { challengeId: string; userId: string; ttlSeconds: number },
  options: SignedAccessTokenOptions = {}
) {
  return createSignedAccessToken(
    CHALLENGE_ACCESS_PURPOSE,
    { cid: input.challengeId, sub: input.userId },
    input.ttlSeconds,
    options
  );
}

export function verifyChallengeAccessGrant(
  token: string | null | undefined,
  input: { challengeId: string; userId: string | null | undefined },
  options: SignedAccessTokenOptions = {}
) {
  if (!input.userId) return false;
  const claims = verifySignedAccessToken(
    CHALLENGE_ACCESS_PURPOSE,
    token,
    options
  );
  return (
    claims !== null &&
    claims.cid === input.challengeId &&
    claims.sub === input.userId
  );
}

/**
 * Whether the current request may open a challenge. Unprotected challenges
 * are always allowed; protected ones need a grant for this challenge and user.
 */
export function hasChallengeAccess(
  challenge: { id: string; password_hash: string | null },
  cookieStore: { get(name: string): { value: string } | undefined },
  userId: string | null | undefined
) {
  if (!challenge.password_hash) return true;
  return verifyChallengeAccessGrant(
    cookieStore.get(challengeAccessCookieName(challenge.id))?.value,
    { challengeId: challenge.id, userId }
  );
}
