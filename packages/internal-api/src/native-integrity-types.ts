export type NativeIntegrityMode = 'off' | 'monitor' | 'enforce';
export type NativeIntegrityMechanism =
  | 'app-attest'
  | 'play-integrity'
  | 'turnstile'
  | 'none';
export type NativeIntegrityBinding = {
  actorId: string;
  method: 'GET' | 'PATCH';
  path: string;
  bodyHash: string;
};
export type NativeIntegrityChallenge = NativeIntegrityBinding & {
  id: string;
  purpose: 'request' | 'enroll';
  keyId?: string;
  requestHash: string;
  expiresAt: number;
};
export type NativeIntegrityKey = {
  actorId: string;
  publicKey: string;
  counter: number;
  environment: 'production' | 'development';
  platform: 'ios' | 'macos';
};
export interface NativeIntegrityStore {
  /** Atomically enforce the actor issuance quota and store with expiresAt TTL. */
  issueChallenge(
    record: NativeIntegrityChallenge,
    quota: { limit: number; windowSeconds: number }
  ): Promise<boolean>;
  /** Atomic GETDEL: never restore a consumed challenge, including on verification failure. */
  consumeChallenge(
    challengeId: string
  ): Promise<NativeIntegrityChallenge | null>;
  getKey(actorId: string, keyId: string): Promise<NativeIntegrityKey | null>;
  /** Register once for actor + keyId, never overwrite an enrolled key. */
  registerKey(
    actorId: string,
    keyId: string,
    key: NativeIntegrityKey
  ): Promise<boolean>;
  /** Compare-and-swap for actor + keyId. Return false if expectedCounter changed. */
  advanceCounter(
    actorId: string,
    keyId: string,
    expectedCounter: number,
    nextCounter: number
  ): Promise<boolean>;
}
export type NativeIntegrityProof = {
  challengeId: string;
  keyId?: string;
  assertion?: string;
  token?: string;
};
export type NativeIntegrityChallengeResponse =
  | { mode: 'off' }
  | {
      mode: 'monitor' | 'enforce';
      challengeId: string;
      requestHash: string;
      expiresAt: number;
      cloudProjectNumber?: string;
      turnstileSiteKey?: string;
      turnstileUrl?: string;
    };
export type NativeIntegrityReason =
  | 'off'
  | 'verified'
  | 'missing-proof'
  | 'invalid-proof'
  | 'expired-challenge'
  | 'binding-mismatch'
  | 'unknown-key'
  | 'counter-conflict'
  | 'provider-unavailable'
  | 'store-unavailable'
  | 'fallback-disabled';
export type NativeIntegrityResult = {
  allowed: boolean;
  mode: NativeIntegrityMode;
  reason: NativeIntegrityReason;
};
export interface NativeIntegrityVerifiers {
  attest(input: {
    attestation: string;
    keyId: string;
    requestHash: string;
  }): Promise<
    Pick<NativeIntegrityKey, 'publicKey' | 'environment' | 'platform'>
  >;
  assert(input: {
    assertion: string;
    publicKey: string;
    platform: 'ios' | 'macos';
    counter: number;
    requestHash: string;
  }): Promise<number>;
  play(input: { token: string; requestHash: string }): Promise<void>;
  turnstile(input: { token: string; requestHash: string }): Promise<void>;
}
export type NativeIntegrityDependencies = {
  mode: NativeIntegrityMode;
  store: NativeIntegrityStore;
  verifiers: NativeIntegrityVerifiers;
  now?: () => number;
  randomBytes?: (size: number) => Uint8Array;
  allowTurnstile?: boolean;
  allowDevelopmentApple?: boolean;
  cloudProjectNumber?: string;
  turnstileSiteKey?: string;
  turnstileUrl?: string;
};
