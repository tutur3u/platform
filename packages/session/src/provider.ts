import type { Effect } from 'effect';
import type { AssuranceLevel, AuthMethod, UserId } from './principal';

/**
 * The only way the session service talks to an identity provider. Apps never
 * use this interface; they see a `Principal`. Provider tokens stay inside the
 * opaque `UpstreamGrant`.
 */

export type ProviderName = 'supabase' | 'better-auth' | (string & {});

/** One sign-in step: password, OTP, OAuth callback, passkey or MFA challenge. */
export type AuthStep = {
  method: AuthMethod;
  /** Flow-bound input, validated by the adapter for its method. */
  payload: Readonly<Record<string, unknown>>;
};

/** Opaque, adapter-owned upstream state. Encrypted at rest by the session service. */
export type UpstreamGrant = {
  readonly provider: ProviderName;
  readonly data: Uint8Array;
};

export type MfaChallenge = {
  challengeId: string;
  methods: readonly AuthMethod[];
};

export type AuthOutcome =
  | {
      kind: 'authenticated';
      providerSubject: string;
      userId: UserId;
      aal: AssuranceLevel;
      amr: readonly AuthMethod[];
      grant?: UpstreamGrant;
    }
  | { kind: 'challenge'; challenge: MfaChallenge }
  | {
      kind: 'rejected';
      reason: 'invalid' | 'locked' | 'unverified' | 'unprovisioned';
    };

export type LinkProof = {
  method: AuthMethod;
  payload: Readonly<Record<string, unknown>>;
};
export type LinkedIdentity = {
  identityId: string;
  method: AuthMethod;
  providerSubject: string;
};
export type FactorSummary = {
  factorId: string;
  method: AuthMethod;
  createdAt: number;
};
/** A passkey credential ID for WebAuthn `allowCredentials`. No public key or counter. */
export type PasskeySummary = {
  credentialId: string;
  transports: readonly string[];
};
export type FactorEnrollment = {
  method: AuthMethod;
  payload: Readonly<Record<string, unknown>>;
};
export type FactorChallenge = {
  challengeId: string;
  payload: Readonly<Record<string, unknown>>;
};

export class AuthError {
  readonly _tag = 'AuthError';
  constructor(readonly code: string) {}
}
export class ProviderUnavailable {
  readonly _tag = 'ProviderUnavailable';
}
export class UpstreamExpired {
  readonly _tag = 'UpstreamExpired';
}
/** A refresh whose outcome was lost. Reconciled once, never retried blindly. */
export class UpstreamUnknown {
  readonly _tag = 'UpstreamUnknown';
}

export interface IdentityProvider {
  readonly name: ProviderName;
  authenticate(
    input: AuthStep
  ): Effect.Effect<AuthOutcome, AuthError | ProviderUnavailable>;
  linkIdentity(
    userId: UserId,
    proof: LinkProof
  ): Effect.Effect<LinkedIdentity, AuthError>;
  unlinkIdentity(
    userId: UserId,
    identityId: string
  ): Effect.Effect<void, AuthError>;
  refreshUpstream(
    grant: UpstreamGrant
  ): Effect.Effect<UpstreamGrant, UpstreamExpired | UpstreamUnknown>;
  revokeUpstream(
    grant: UpstreamGrant
  ): Effect.Effect<void, ProviderUnavailable>;
  factors(
    userId: UserId
  ): Effect.Effect<readonly FactorSummary[], ProviderUnavailable>;
  passkeys(
    userId: UserId
  ): Effect.Effect<readonly PasskeySummary[], ProviderUnavailable>;
  enrollFactor(
    userId: UserId,
    request: FactorEnrollment
  ): Effect.Effect<FactorChallenge, AuthError>;
}
