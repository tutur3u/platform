import type { AuthMethod } from './auth-methods';
import { isIssuedAssertion } from './verify';

export type SessionEnvironment = 'production' | 'staging' | 'local';

export type UserId = string & { readonly __brand: 'UserId' };

export { AUTH_METHODS, type AuthMethod } from './auth-methods';

export type AssuranceLevel = 'aal1' | 'aal2';

export type Scope = string;

declare const verifiedBrand: unique symbol;

/**
 * The claims of an identity assertion that passed verification. It is frozen
 * at runtime and branded at the type level, so only the verifier produces one.
 * It proves a signature and a time window, not liveness or authorization.
 */
export type VerifiedAssertion = Readonly<{
  keyId: string;
  issuer: string;
  environment: SessionEnvironment;
  audience: `mount:${string}`;
  userId: UserId;
  sessionId: string;
  generation: number;
  source: 'cookie' | 'bearer';
  stale: boolean;
  aal: AssuranceLevel;
  amr: readonly AuthMethod[];
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  jwtId: string;
  ipPrefix: string | null;
}> & { readonly [verifiedBrand]: true };

/**
 * Who one request is for. It is request-scoped and must not be cached past
 * `expiresAt`. It is not an authorization decision: workspace membership and
 * action permissions stay with the permission helpers, and a sensitive action
 * still needs a live session check and a step-up grant.
 */
export type Principal = Readonly<{
  kind: 'user' | 'api_key' | 'service' | 'external_app';
  userId: UserId | null;
  sessionId: string | null;
  generation: number | null;
  stale: boolean;
  source: 'cookie' | 'bearer' | 'api_key' | 'service_binding';
  aal: AssuranceLevel;
  amr: readonly AuthMethod[];
  authTime: number;
  appId: string | null;
  scopes: readonly Scope[];
  /** Epoch seconds after which this principal must not be used. */
  expiresAt: number | null;
}>;

export function principalFromAssertion(
  assertion: VerifiedAssertion
): Principal {
  // Only objects the verifier returned are accepted, so a modified copy of a
  // verified assertion cannot become a principal.
  if (!isIssuedAssertion(assertion)) {
    throw new TypeError('principalFromAssertion needs a verifier result');
  }
  return Object.freeze({
    kind: 'user',
    userId: assertion.userId,
    sessionId: assertion.sessionId,
    generation: assertion.generation,
    stale: assertion.stale,
    source: assertion.source,
    aal: assertion.aal,
    amr: assertion.amr,
    authTime: assertion.authTime,
    appId: assertion.audience.slice('mount:'.length),
    scopes: Object.freeze([]),
    expiresAt: assertion.expiresAt,
  });
}
