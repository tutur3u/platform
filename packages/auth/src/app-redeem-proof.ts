import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerTokenSecretCandidates } from '@tuturuuu/utils/app-coordination-token';

/**
 * Worker-only redemption. For these targets a cross-app handoff token or an
 * app-session refresh credential is redeemable only together with an HMAC
 * proof from the coordination secret, which only the target's own Worker
 * and Web hold. A handoff URL copied from history or logs, or a refresh
 * cookie lifted from the browser, cannot mint a session anywhere else.
 */
export const APP_REDEEM_PROOF_HEADER = 'x-tuturuuu-app-redeem-proof';
export const WORKER_ONLY_REDEEM_TARGETS: readonly string[] = ['mastermind'];

export function requiresWorkerRedeemProof(targetApp: string) {
  return WORKER_ONLY_REDEEM_TARGETS.includes(targetApp.trim().toLowerCase());
}

function sign(targetApp: string, credential: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`app-redeem:v1:${targetApp.trim().toLowerCase()}:${credential}`)
    .digest('base64url');
}

export function createAppRedeemProof(
  targetApp: string,
  credential: string,
  secret: string
) {
  return sign(targetApp, credential, secret);
}

/** Accepts a proof from any current coordination secret (rotation-safe). */
export function verifyAppRedeemProof(
  {
    targetApp,
    credential,
    proof,
  }: { targetApp: string; credential: string; proof: string | null },
  explicitSecret?: string
) {
  if (!proof) return false;
  const actual = Buffer.from(proof);
  return getServerTokenSecretCandidates(explicitSecret).some((secret) => {
    const expected = Buffer.from(sign(targetApp, credential, secret));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
}
