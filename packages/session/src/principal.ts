export type SessionEnvironment = 'production' | 'staging' | 'local';

export type UserId = string & { readonly __brand: 'UserId' };

export type AuthMethod =
  | 'pwd'
  | 'otp'
  | 'totp'
  | 'passkey'
  | 'oauth'
  | 'sso'
  | 'device_approval'
  | 'qr';

export const AUTH_METHODS: readonly AuthMethod[] = [
  'pwd',
  'otp',
  'totp',
  'passkey',
  'oauth',
  'sso',
  'device_approval',
  'qr',
];

export type AssuranceLevel = 'aal1' | 'aal2';

export type Scope = string;

/** The claims of an identity assertion that passed verification. */
export type VerifiedAssertion = {
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
};

/**
 * Who a request is for. It is not an authorization decision: workspace
 * membership and action permissions stay with the permission helpers, and a
 * sensitive action still needs a live session check and a step-up grant.
 */
export type Principal = {
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
};

export function principalFromAssertion(
  assertion: VerifiedAssertion
): Principal {
  return {
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
    scopes: [],
  };
}
