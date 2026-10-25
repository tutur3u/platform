import {
  isMfaSessionProof,
  type MfaSessionProof,
} from '@tuturuuu/utils/required-mfa-policy';
import { PASSWORDS_LIMITS } from './port';

export type StepUpEvaluation =
  | { fresh: true; expiresAtSeconds: number }
  | { fresh: false };

/**
 * Pure step-up gate for the parent adapter. `proof` must come from the signed
 * app-session claims (`claims.mfa`) of a request that already passed
 * `getAppSessionClaimsFromRequest(..., { targetApp: 'passwords' })`.
 * Never derive it from a token `iat`/`exp`: a refresh must not turn an old
 * proof into a new one.
 */
export function evaluateStepUp(
  proof: MfaSessionProof | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = PASSWORDS_LIMITS.stepUpMaxAgeSeconds
): StepUpEvaluation {
  if (!isMfaSessionProof(proof)) return { fresh: false };
  if (proof.verifiedAt > nowSeconds) return { fresh: false };
  if (proof.verifiedAt + maxAgeSeconds <= nowSeconds) return { fresh: false };
  if (proof.expiresAt !== undefined && proof.expiresAt <= nowSeconds)
    return { fresh: false };
  return {
    fresh: true,
    expiresAtSeconds: Math.min(
      proof.verifiedAt + maxAgeSeconds,
      proof.expiresAt ?? Number.POSITIVE_INFINITY
    ),
  };
}
