/**
 * Verification of a `ttr+stepup` proof against one relying service's stored
 * challenge. Success grants nothing: only `authorizeStepUp` turns a verified
 * proof into an authorization, after the challenge is consumed and the
 * session is confirmed live.
 */
import { constantTimeEqual, decodeBase64Url } from '../encoding';
import type { SessionEnvironment, UserId } from '../principal';
import { isUserId } from '../token-claims';
import {
  isTimestamp,
  type KeySource,
  MAX_TOKEN_LIFETIME_SECONDS,
  type VerifyFailureReason,
} from '../token-core';
import { verifyToken } from '../tokens/verify-token';
import { isStepUpAct, PARAMS_HASH_BYTES, type StepUpAct } from './params-hash';

export type StepUpFactor = 'totp' | 'passkey';

const STEP_UP_FACTORS: readonly StepUpFactor[] = Object.freeze([
  'totp',
  'passkey',
]);
const MIN_NONCE_BYTES = 16;
const MAX_NONCE_BYTES = 32;
const AUTH_TIME_WINDOW_SECONDS = 300;

export type StepUpVerifyOptions = {
  issuer: string;
  environment: SessionEnvironment;
  /** Step-up class keys with their lifetimes. */
  keys: KeySource;
  /** Current time in seconds. */
  now: () => number;
  /** `stepup:<service>`, the verifying service. */
  audience: `stepup:${string}`;
  /** The user the relying service issued its challenge for. */
  subject: UserId;
  act: StepUpAct;
  /** `paramsHash` bytes computed from the service's own stored challenge. */
  expectedParamsHash: Uint8Array;
  /** Factors this service accepts; only `totp` and `passkey` can count. */
  allowedAmr: readonly string[];
};

export type StepUpFailureReason =
  | VerifyFailureReason
  | 'options'
  | 'subject_mismatch'
  | 'act_mismatch'
  | 'amr_not_allowed'
  | 'params_mismatch';

export type StepUpFailure = Readonly<{
  ok: false;
  reason: StepUpFailureReason;
}>;

declare const stepUpBrand: unique symbol;

/**
 * A step-up proof that passed verification. Frozen at runtime and branded at
 * the type level; only `verifyStepUpProof` constructs one. It proves a
 * signature, a time window and a parameters binding, and authorizes nothing.
 */
export type StepUpVerified = Readonly<{
  ok: true;
  audience: `stepup:${string}`;
  subject: UserId;
  sessionId: string;
  generation: number;
  act: StepUpAct;
  nonce: string;
  jti: string;
  expiresAt: number;
  amr: readonly StepUpFactor[];
}> & { readonly [stepUpBrand]: true };

// The proofs this verifier returned and `authorizeStepUp` has not yet taken.
const issuedProofs = new WeakSet<object>();

/**
 * Removes a verified proof from the issued set and reports whether it was
 * there, so each verified object reaches the consume port at most once.
 */
export function takeIssuedStepUp(value: unknown): value is StepUpVerified {
  return (
    typeof value === 'object' && value !== null && issuedProofs.delete(value)
  );
}

const fail = (reason: StepUpFailureReason): StepUpFailure =>
  Object.freeze({ ok: false, reason });

function readOptions(options: StepUpVerifyOptions): {
  allowed: ReadonlySet<StepUpFactor>;
  expected: Uint8Array;
} | null {
  const { subject, act, expectedParamsHash, allowedAmr } = options;
  if (
    !isUserId(subject) ||
    !isStepUpAct(act) ||
    !(expectedParamsHash instanceof Uint8Array) ||
    expectedParamsHash.length !== PARAMS_HASH_BYTES ||
    !Array.isArray(allowedAmr)
  ) {
    return null;
  }
  const allowed = new Set(
    STEP_UP_FACTORS.filter((factor) => allowedAmr.includes(factor))
  );
  // A service that accepts no step-up factor is misconfigured.
  if (allowed.size === 0) return null;
  return {
    allowed,
    // A copy, so the caller cannot change the bytes during verification.
    expected: new Uint8Array(expectedParamsHash),
  };
}

function hasUniqueFactors(
  amr: readonly unknown[],
  allowed: ReadonlySet<StepUpFactor>
): boolean {
  return (
    amr.length > 0 &&
    new Set(amr).size === amr.length &&
    amr.every((method) => allowed.has(method as StepUpFactor))
  );
}

/**
 * Verifies a step-up proof with `verifyToken('stepup', …)`, then binds it to
 * this challenge: `sub` equals `subject`, `act` equals `act`, `amr` is a
 * non-empty duplicate-free subset of `allowedAmr ∩ {totp, passkey}`, and `ph`
 * decodes to 32 bytes equal (in constant time) to `expectedParamsHash`. It
 * re-checks `aal2`, the nonce length, `auth_time` within `[iat - 300, iat]`
 * and `exp - iat <= 300`. It never throws and makes no network call.
 */
export async function verifyStepUpProof(
  token: string,
  options: StepUpVerifyOptions
): Promise<StepUpVerified | StepUpFailure> {
  const read = readOptions(options);
  if (!read) return fail('options');
  const result = await verifyToken('stepup', token, {
    issuer: options.issuer,
    environment: options.environment,
    audience: options.audience,
    keys: options.keys,
    now: options.now,
  });
  if (!result.ok) {
    // `topic` belongs to the realtime class and cannot occur here.
    return fail(result.reason === 'topic' ? 'claims' : result.reason);
  }
  const claims = result.token.claims;

  if (claims.sub !== options.subject) return fail('subject_mismatch');
  if (claims.act !== options.act) return fail('act_mismatch');
  if (!Array.isArray(claims.amr)) return fail('claims');
  if (!hasUniqueFactors(claims.amr, read.allowed)) {
    return fail('amr_not_allowed');
  }
  if (claims.aal !== 'aal2') return fail('claims');

  const ph = typeof claims.ph === 'string' ? decodeBase64Url(claims.ph) : null;
  if (!ph || ph.length !== PARAMS_HASH_BYTES) return fail('claims');
  if (!constantTimeEqual(ph, read.expected)) return fail('params_mismatch');

  const nonce =
    typeof claims.nonce === 'string' ? decodeBase64Url(claims.nonce) : null;
  if (
    !nonce ||
    nonce.length < MIN_NONCE_BYTES ||
    nonce.length > MAX_NONCE_BYTES
  ) {
    return fail('claims');
  }

  const { iat, exp, auth_time: authTime } = claims;
  if (
    !isTimestamp(iat) ||
    !isTimestamp(exp) ||
    !isTimestamp(authTime) ||
    authTime > iat ||
    authTime < iat - AUTH_TIME_WINDOW_SECONDS ||
    exp - iat > MAX_TOKEN_LIFETIME_SECONDS.stepup
  ) {
    return fail('time');
  }

  const verified = Object.freeze({
    ok: true as const,
    audience: options.audience,
    subject: claims.sub as UserId,
    sessionId: claims.sid,
    generation: claims.gen,
    act: claims.act,
    nonce: claims.nonce,
    jti: claims.jti,
    expiresAt: exp,
    amr: Object.freeze([...claims.amr]),
  }) as StepUpVerified;
  issuedProofs.add(verified);
  return verified;
}
