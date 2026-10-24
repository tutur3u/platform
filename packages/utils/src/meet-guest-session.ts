import {
  createSignedAccessToken,
  type SignedAccessTokenOptions,
  verifySignedAccessToken,
} from './signed-access-token';

/**
 * Server-issued Meet guest sessions.
 *
 * A guest proves their password once to the server, which returns this
 * short-lived token bound to one guest and one plan. Later guest mutations
 * present the token instead of any stored password material.
 */

export const MEET_GUEST_SESSION_PURPOSE = 'meet-guest-session';
export const MEET_GUEST_SESSION_TTL_SECONDS = 12 * 60 * 60;

const COMPACT_UUID_PATTERN =
  /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/u;

/** Normalises dashed or compact plan identifiers to lowercase dashed form. */
export function normalizeMeetPlanId(planId: string) {
  const lower = planId.trim().toLowerCase();
  return lower.replace(COMPACT_UUID_PATTERN, '$1-$2-$3-$4-$5');
}

export function createMeetGuestSession(
  input: { guestId: string; planId: string },
  options: SignedAccessTokenOptions = {}
) {
  const { token, expiresAt } = createSignedAccessToken(
    MEET_GUEST_SESSION_PURPOSE,
    { sub: input.guestId, pid: normalizeMeetPlanId(input.planId) },
    MEET_GUEST_SESSION_TTL_SECONDS,
    options
  );

  return { token, expiresAt };
}

/**
 * Verifies a guest session for the given plan. Returns the guest id only when
 * the signature, purpose, expiry and plan binding all match.
 */
export function verifyMeetGuestSession(
  token: unknown,
  planId: string,
  options: SignedAccessTokenOptions = {}
): { guestId: string } | null {
  const claims = verifySignedAccessToken(
    MEET_GUEST_SESSION_PURPOSE,
    token,
    options
  );
  if (!claims) return null;
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  if (
    typeof claims.pid !== 'string' ||
    claims.pid !== normalizeMeetPlanId(planId)
  ) {
    return null;
  }

  return { guestId: claims.sub };
}
