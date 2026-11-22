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

const MASTERMIND_LOGIN_PURPOSE = 'mastermind-login-v1';
export const MASTERMIND_LOGIN_TRANSACTION_PARAM = 'mm_tx';
export const MASTERMIND_LOGIN_TRANSACTION_SECONDS = 600;
export const MASTERMIND_FRESH_MFA_SECONDS = 30;
const MASTERMIND_CALLBACK = 'https://mastermind.tuturuuu.com/verify-token';

/** The Worker generates the challenge and binds it to its own callback and MFA intent. */
export function createMastermindLoginTransaction(
  callback: URL,
  challenge: string,
  freshMfa: boolean,
  secret: string,
  now = Date.now()
) {
  const expiresAt =
    Math.floor(now / 1000) + MASTERMIND_LOGIN_TRANSACTION_SECONDS;
  const binding = [expiresAt, challenge, freshMfa ? 'fresh' : 'normal'].join(
    '.'
  );
  const proof = sign(
    MASTERMIND_LOGIN_PURPOSE,
    JSON.stringify([callback.href, binding]),
    secret
  );
  return `${binding}.${proof}`;
}

export function verifyMastermindLoginTransaction(
  returnUrl: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const callback = new URL(returnUrl);
  if (
    callback.origin + callback.pathname !== MASTERMIND_CALLBACK ||
    callback.username ||
    callback.password ||
    callback.hash
  )
    return null;
  const transactions = callback.searchParams.getAll(
    MASTERMIND_LOGIN_TRANSACTION_PARAM
  );
  if (transactions.length !== 1) return null;
  const transaction = transactions[0];
  const match =
    /^(\d{10})\.([A-Za-z0-9_-]{43})\.(fresh|normal)\.([A-Za-z0-9_-]{43})$/u.exec(
      transaction ?? ''
    );
  if (!match) return null;
  const [, expiry, codeChallenge, mode, proof] = match;
  if (!expiry || !codeChallenge || !mode || !proof) return null;
  const expiresAt = Number(expiry);
  if (
    expiresAt <= nowSeconds ||
    expiresAt > nowSeconds + MASTERMIND_LOGIN_TRANSACTION_SECONDS
  )
    return null;
  callback.searchParams.delete(MASTERMIND_LOGIN_TRANSACTION_PARAM);
  if (
    !verifyAppRedeemProof({
      targetApp: MASTERMIND_LOGIN_PURPOSE,
      credential: JSON.stringify([
        callback.href,
        [expiry, codeChallenge, mode].join('.'),
      ]),
      proof,
    })
  )
    return null;
  return {
    callback: callback.href,
    codeChallenge,
    codeChallengeMethod: 'S256' as const,
    expiresAt,
    mfaMaxAge: mode === 'fresh' ? MASTERMIND_FRESH_MFA_SECONDS : undefined,
  };
}

const MASTERMIND_HANDOFF_ISSUER_PURPOSE = 'mastermind-handoff-issuer-v1';
export const MASTERMIND_HANDOFF_ISSUER_PARAM = 'mm_issuer';

/** Only Web stamps a handoff after claiming the signed Worker transaction. */
export function createMastermindHandoffIssuerProof(token: string) {
  const [secret] = getServerTokenSecretCandidates();
  if (!secret) throw new Error('Mastermind handoff signing unavailable');
  return sign(MASTERMIND_HANDOFF_ISSUER_PURPOSE, token, secret);
}

export function verifyMastermindHandoffIssuerProof(
  token: string,
  proof: string | undefined
) {
  return verifyAppRedeemProof({
    targetApp: MASTERMIND_HANDOFF_ISSUER_PURPOSE,
    credential: token,
    proof: proof ?? null,
  });
}
