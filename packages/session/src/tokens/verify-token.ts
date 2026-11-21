import type { SessionEnvironment } from '../principal';
import { checkClaims, deepFreeze } from '../token-claims';
import {
  isTokenClass,
  type KeySource,
  type TokenClass,
  type VerifyFailureReason,
  verifyCompact,
} from '../token-core';
import {
  type AccessClaims,
  PROFILES,
  type RealtimeTopic,
  type TokenClaims,
} from './profiles';

export type TokenAudience = {
  identity: `mount:${string}`;
  stepup: `stepup:${string}`;
  s2s: `service:${string}`;
  realtime: `realtime:${string}`;
  access: AccessClaims['aud'];
};

/** The expected values and registries each class verifies against. */
export type ClassVerifyOptions = {
  identity: object;
  stepup: object;
  s2s: { services: readonly string[] };
  realtime: { topic: RealtimeTopic };
  access: { scopes: readonly string[]; clients: readonly string[] };
};

export type VerifyTokenOptions<C extends TokenClass> = {
  issuer: string;
  environment: SessionEnvironment;
  audience: TokenAudience[C];
  /** Keys of this class with their lifetimes. */
  keys: KeySource;
  /** Current time in seconds. */
  now: () => number;
} & ClassVerifyOptions[C];

export type TokenVerifyFailureReason = VerifyFailureReason | 'topic';

export type VerifiedToken<C extends TokenClass> = Readonly<{
  class: C;
  keyId: string;
  claims: Readonly<TokenClaims[C]>;
}>;

export type VerifyTokenResult<C extends TokenClass> =
  | { ok: true; token: VerifiedToken<C> }
  | { ok: false; reason: TokenVerifyFailureReason };

/**
 * Verifies a token of one class. It pins `alg: ES256` and the class's `typ`,
 * rejects every member outside the class's closed set, binds `iss`, `env`
 * and `aud` to the configured values, checks the class's registries and
 * topic, and applies key acceptance. It never throws and makes no network
 * call. Success proves a signature and a time window, not liveness or
 * authorization.
 */
export async function verifyToken<C extends TokenClass>(
  tokenClass: C,
  token: string,
  options: VerifyTokenOptions<C>
): Promise<VerifyTokenResult<C>> {
  if (!isTokenClass(tokenClass)) return { ok: false, reason: 'type' };
  const profile = PROFILES[tokenClass];
  if (
    typeof options.audience !== 'string' ||
    !profile.audience(options.audience)
  ) {
    return { ok: false, reason: 'audience' };
  }
  const verified = await verifyCompact(
    token,
    tokenClass,
    options.keys,
    options.now
  );
  if (!verified.ok) return verified;
  const classOptions = options as Record<string, unknown>;
  const failure = checkClaims(
    profile,
    verified.claims,
    {
      issuer: options.issuer,
      environment: options.environment,
      audience: options.audience,
    },
    {
      mint: false,
      services: classOptions.services,
      scopes: classOptions.scopes,
      clients: classOptions.clients,
      topic: classOptions.topic,
    },
    verified.now
  );
  if (failure === 'caller') return { ok: false, reason: 'claims' };
  if (failure) return { ok: false, reason: failure };
  return {
    ok: true,
    token: Object.freeze({
      class: tokenClass,
      keyId: verified.kid,
      claims: deepFreeze(verified.claims) as unknown as TokenClaims[C],
    }),
  };
}
