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
export const WORKER_ONLY_REDEEM_TARGETS: readonly string[] = [
  'mastermind',
  'worlds',
];

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
/** The dedicated-host callback the serving Mastermind Worker returns to. */
export const MASTERMIND_HOST_CALLBACK =
  'https://mastermind.tuturuuu.com/verify-token';
/**
 * The apex-mount callback. Web admits it only behind an explicit flag, and
 * never resolves it as the platform app.
 */
export const MASTERMIND_APEX_CALLBACK =
  'https://tuturuuu.com/mastermind/verify-token';
export type MastermindCallback =
  | typeof MASTERMIND_HOST_CALLBACK
  | typeof MASTERMIND_APEX_CALLBACK;

/**
 * Which exact Mastermind callback a URL targets (origin and path only), or
 * `null`. Query, credentials and fragment are judged by the transaction.
 */
export function mastermindCallbackOf(url: string): MastermindCallback | null {
  try {
    const parsed = new URL(url);
    const endpoint = parsed.origin + parsed.pathname;
    return endpoint === MASTERMIND_HOST_CALLBACK ||
      endpoint === MASTERMIND_APEX_CALLBACK
      ? endpoint
      : null;
  } catch {
    return null;
  }
}

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

/**
 * Verifies the Worker-signed transaction on a Mastermind return. The host
 * callback is always eligible; the apex callback only when the caller says
 * the apex mount is admitted (`apex: true`).
 */
export function verifyMastermindLoginTransaction(
  returnUrl: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  { apex = false }: { apex?: boolean } = {}
) {
  const callback = new URL(returnUrl);
  const endpoint = mastermindCallbackOf(returnUrl);
  if (
    !endpoint ||
    (endpoint === MASTERMIND_APEX_CALLBACK && !apex) ||
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
    /** The exact signed callback, with its query and without `mm_tx`. */
    callback: callback.href,
    endpoint,
    codeChallenge,
    codeChallengeMethod: 'S256' as const,
    expiresAt,
    mfaMaxAge: mode === 'fresh' ? MASTERMIND_FRESH_MFA_SECONDS : undefined,
  };
}

const MASTERMIND_HANDOFF_ISSUER_PURPOSE = 'mastermind-handoff-issuer-v1';
const MASTERMIND_HANDOFF_ISSUER_V2_PURPOSE = 'mastermind-handoff-issuer-v2';
/** A v2 issuer proof is `v2.` + HMAC(JSON [token, exact callback]). */
export const MASTERMIND_HANDOFF_ISSUER_V2_PREFIX = 'v2.';
export const MASTERMIND_HANDOFF_ISSUER_PARAM = 'mm_issuer';

/**
 * Only Web stamps a handoff after claiming the signed Worker transaction.
 * With a callback it issues v2, bound to that exact callback, so a handoff
 * issued for the host return never redeems through the apex one or back.
 * Without one it issues the legacy v1 proof (token only, host only).
 */
export function createMastermindHandoffIssuerProof(
  token: string,
  callback?: MastermindCallback
) {
  const [secret] = getServerTokenSecretCandidates();
  if (!secret) throw new Error('Mastermind handoff signing unavailable');
  if (callback === undefined)
    return sign(MASTERMIND_HANDOFF_ISSUER_PURPOSE, token, secret);
  return `${MASTERMIND_HANDOFF_ISSUER_V2_PREFIX}${sign(
    MASTERMIND_HANDOFF_ISSUER_V2_PURPOSE,
    JSON.stringify([token, callback]),
    secret
  )}`;
}

/**
 * `callback` is the exact callback the redeeming Worker serves, as it states
 * it. A v2 proof verifies only for that callback. A v1 proof verifies only
 * when `acceptV1` is set and the stated callback is absent or the host one.
 */
export function verifyMastermindHandoffIssuerProof(
  token: string,
  proof: string | undefined,
  { acceptV1, callback }: { acceptV1: boolean; callback?: string }
) {
  if (!proof) return false;
  if (proof.startsWith(MASTERMIND_HANDOFF_ISSUER_V2_PREFIX)) {
    if (
      callback !== MASTERMIND_HOST_CALLBACK &&
      callback !== MASTERMIND_APEX_CALLBACK
    )
      return false;
    return verifyAppRedeemProof({
      targetApp: MASTERMIND_HANDOFF_ISSUER_V2_PURPOSE,
      credential: JSON.stringify([token, callback]),
      proof: proof.slice(MASTERMIND_HANDOFF_ISSUER_V2_PREFIX.length),
    });
  }
  if (!acceptV1) return false;
  if (callback !== undefined && callback !== MASTERMIND_HOST_CALLBACK)
    return false;
  return verifyAppRedeemProof({
    targetApp: MASTERMIND_HANDOFF_ISSUER_PURPOSE,
    credential: token,
    proof,
  });
}
