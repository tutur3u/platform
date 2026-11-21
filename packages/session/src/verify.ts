import type { AuthMethod } from './auth-methods';
import { readAmr, IDENTITY_PROFILE } from './identity-profile';
import type {
  SessionEnvironment,
  UserId,
  VerifiedAssertion,
} from './principal';
import { checkClaims } from './token-claims';
import {
  type KeySource,
  MAX_TOKEN_BYTES,
  type VerifyFailureReason,
  verifyCompact,
} from './token-core';

export type { VerifiedAssertion } from './principal';
export type {
  KeySource,
  TokenClass,
  TokenKey,
  VerifyFailureReason,
} from './token-core';
export { FUTURE_IAT_TOLERANCE_SECONDS } from './token-core';

export const IDENTITY_ASSERTION_TYPE = 'ttr+identity';
export const MAX_ASSERTION_BYTES = MAX_TOKEN_BYTES;

export type VerifyResult =
  | { ok: true; assertion: VerifiedAssertion }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyOptions = {
  issuer: string;
  environment: SessionEnvironment;
  audience: `mount:${string}`;
  /** Identity-class keys with their lifetimes. */
  keys: KeySource;
  /** Current time in seconds. */
  now: () => number;
};

// The objects this verifier returned. Private to this module: other modules
// can only ask whether an object is one of them.
const issuedAssertions = new WeakSet<object>();

function registerIssuedAssertion<T extends object>(assertion: T): T {
  issuedAssertions.add(assertion);
  return assertion;
}

/** Whether `value` is an assertion object this verifier returned. */
export function isIssuedAssertion(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && issuedAssertions.has(value)
  );
}

const fail = (reason: VerifyFailureReason): VerifyResult => ({
  ok: false,
  reason,
});

/**
 * Verifies a gateway-issued identity assertion. Success proves only that a
 * trusted identity-class key, inside its lifetime, signed these claims for
 * this issuer, environment and mount, inside the accepted clock window. It
 * does not prove how the request arrived, that the session is live, or that
 * any action is allowed. It never throws and makes no network call.
 */
export async function verifyIdentityAssertion(
  token: string,
  options: VerifyOptions
): Promise<VerifyResult> {
  if (
    typeof options.audience !== 'string' ||
    !IDENTITY_PROFILE.audience(options.audience)
  ) {
    return fail('audience');
  }
  const verified = await verifyCompact(
    token,
    'identity',
    options.keys,
    options.now
  );
  if (!verified.ok) return verified;
  const { kid, claims, now } = verified;
  const failure = checkClaims(
    IDENTITY_PROFILE,
    claims,
    {
      issuer: options.issuer,
      environment: options.environment,
      audience: options.audience,
    },
    { mint: false },
    now
  );
  // The identity profile reports only shared verification reasons.
  if (failure) return fail(failure as VerifyFailureReason);

  const ipp = claims.ipp;
  return {
    ok: true,
    assertion: registerIssuedAssertion(
      Object.freeze({
        keyId: kid,
        issuer: options.issuer,
        environment: options.environment,
        audience: options.audience,
        userId: claims.sub as UserId,
        sessionId: claims.sid as string,
        generation: claims.gen as number,
        source: claims.src as 'cookie' | 'bearer',
        stale: claims.stale as boolean,
        aal: claims.aal as 'aal1' | 'aal2',
        amr: Object.freeze(readAmr(claims.amr) as AuthMethod[]),
        authTime: claims.auth_time as number,
        issuedAt: claims.iat as number,
        expiresAt: claims.exp as number,
        jwtId: claims.jti as string,
        ipPrefix: typeof ipp === 'string' ? ipp : null,
      })
    ) as VerifiedAssertion,
  };
}
