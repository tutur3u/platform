/**
 * Closed claim profiles and the checks every class shares. The same profile
 * runs before minting and after verification, so a signer refuses exactly
 * what a verifier would reject.
 */
import { decodeBase64Url, hasOwn, type JsonValue } from './encoding';
import type { SessionEnvironment } from './principal';
import {
  type ClaimSet,
  FUTURE_IAT_TOLERANCE_SECONDS,
  isTimestamp,
  type TokenClass,
  type VerifyFailureReason,
} from './token-core';

export const ENVIRONMENTS: ReadonlySet<string> = new Set<SessionEnvironment>([
  'production',
  'staging',
  'local',
]);

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A service, mount or verifier name inside an audience or an s2s identity. */
export const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;

const MAX_ISSUER_LENGTH = 2048;

export type ProfileFailure = 'claims' | 'topic' | 'caller';

/**
 * Per-call context of a profile. `mint` is true before signing, when no
 * expected values exist but the registries and the caller do.
 */
export type ProfileContext = Readonly<{
  mint: boolean;
  caller?: unknown;
  services?: unknown;
  scopes?: unknown;
  clients?: unknown;
  topic?: unknown;
}>;

export type ClaimProfile = Readonly<{
  tokenClass: TokenClass;
  /** Every member the claims may carry. Anything else is rejected. */
  members: ReadonlySet<string>;
  required: readonly string[];
  /** Whether an `aud` value has this class's shape. */
  audience(value: string): boolean;
  /** Class member types; runs after `iss`, `env`, `aud` and `jti`. */
  check(claims: ClaimSet, context: ProfileContext): ProfileFailure | null;
  /** The lifetime cap for these (already checked) claims, in seconds. */
  lifetime(claims: ClaimSet): number;
  /** Extra time rules, such as `auth_time` against `iat`. */
  timing?(claims: ClaimSet, iat: number): boolean;
}>;

export type ExpectedValues = Readonly<{
  issuer: string;
  environment: SessionEnvironment;
  audience: string;
}>;

export type ClaimFailure = VerifyFailureReason | ProfileFailure;

/** 16 bytes in canonical base64url. */
export function isId16(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && decodeBase64Url(value)?.length === 16;
}

export function isUserId(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isGeneration(value: JsonValue | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
  );
}

/** Whether `value` is listed in an injected registry. A missing registry lists nothing. */
export function inRegistry(registry: unknown, value: string): boolean {
  return Array.isArray(registry) && registry.includes(value);
}

/** An audience of the form `<prefix>:<name>`. */
export function prefixedAudience(prefix: string): (value: string) => boolean {
  return (value) =>
    value.startsWith(`${prefix}:`) &&
    SERVICE_NAME_PATTERN.test(value.slice(prefix.length + 1));
}

/**
 * Runs the shared and class checks over parsed claims. With `expected` it
 * binds `iss`, `env` and `aud` to the verifier's configuration; without it
 * (minting) it checks only their types and shapes.
 */
export function checkClaims(
  profile: ClaimProfile,
  claims: ClaimSet,
  expected: ExpectedValues | null,
  context: ProfileContext,
  now: number
): ClaimFailure | null {
  if (Object.keys(claims).some((member) => !profile.members.has(member))) {
    return 'claims';
  }
  if (profile.required.some((member) => !hasOwn(claims, member))) {
    return 'claims';
  }

  const { iss, env, aud } = claims;
  if (expected) {
    if (iss !== expected.issuer) return 'issuer';
  } else if (
    typeof iss !== 'string' ||
    iss.length === 0 ||
    iss.length > MAX_ISSUER_LENGTH
  ) {
    return 'claims';
  }
  if (typeof env !== 'string' || !ENVIRONMENTS.has(env)) return 'claims';
  if (expected && env !== expected.environment) return 'environment';
  if (expected) {
    if (aud !== expected.audience) return 'audience';
  } else if (typeof aud !== 'string' || !profile.audience(aud)) {
    return 'claims';
  }
  if (!isId16(claims.jti)) return 'claims';

  const failure = profile.check(claims, context);
  if (failure) return failure;

  const { iat, exp } = claims;
  if (!isTimestamp(iat) || !isTimestamp(exp)) return 'claims';
  if (
    !Number.isFinite(now) ||
    exp <= iat ||
    exp - iat > profile.lifetime(claims) ||
    iat > now + FUTURE_IAT_TOLERANCE_SECONDS ||
    now >= exp ||
    (profile.timing !== undefined && !profile.timing(claims, iat))
  ) {
    return 'time';
  }
  return null;
}

/** Freezes parsed claims and every nested array or object. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
