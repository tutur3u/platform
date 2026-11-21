import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';

/**
 * The range a caller may ask for when it requires a recent second-factor
 * proof. The floor keeps a just-verified proof usable for the request that
 * follows; the ceiling keeps the value a step-up, not a session lifetime.
 */
export const MFA_MAX_AGE_SECONDS = { min: 30, max: 3600 } as const;

/**
 * A requested maximum proof age: `undefined` when none was asked for, the
 * whole number of seconds when it is in range, and `false` for anything else
 * (a string, a fraction, zero, a negative or an oversized number), which the
 * caller refuses instead of guessing a value.
 */
export function parseMfaMaxAge(raw: unknown): number | undefined | false {
  if (raw === undefined) return undefined;
  return typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw >= MFA_MAX_AGE_SECONDS.min &&
    raw <= MFA_MAX_AGE_SECONDS.max
    ? raw
    : false;
}

/**
 * Whether a second-factor proof was made at most `maxAgeSeconds` ago,
 * inclusive, is not dated in the future and has not expired. No proof is
 * never fresh.
 */
export function isFreshMfaProof(
  proof: MfaSessionProof | null,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  return Boolean(
    proof &&
    proof.verifiedAt <= nowSeconds &&
    nowSeconds - proof.verifiedAt <= maxAgeSeconds &&
    (proof.expiresAt === undefined || proof.expiresAt > nowSeconds)
  );
}
