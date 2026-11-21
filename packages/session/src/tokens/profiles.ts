/** Closed claim profiles of the step-up, s2s, realtime and access classes. */
import type { AuthMethod } from '../auth-methods';
import { decodeBase64Url, isJsonObject, utf8 } from '../encoding';
import { IDENTITY_PROFILE } from '../identity-profile';
import type { SessionEnvironment } from '../principal';
import {
  type ClaimProfile,
  inRegistry,
  isGeneration,
  isId16,
  isUserId,
  prefixedAudience,
  SERVICE_NAME_PATTERN,
  UUID_PATTERN,
} from '../token-claims';
import {
  isTimestamp,
  MAX_TOKEN_LIFETIME_SECONDS,
  type TokenClass,
} from '../token-core';

export const ACCESS_AUDIENCE = 'https://tuturuuu.com/api';
export const STEP_UP_ACTS: readonly string[] = Object.freeze([
  'vault.pin-eval',
]);
export const MAX_WORKSPACES = 64;
export const MAX_TOPIC_ID_BYTES = 128;
const STEP_UP_AUTH_WINDOW_SECONDS = 300;
const STEP_UP_FACTORS = new Set(['totp', 'passkey']);
const REALTIME_TOPIC_KINDS = new Set(['channel', 'meet', 'chat']);
const CHANNEL_LIFETIME_SECONDS = 60;
/** RFC 6749 `scope-token` characters. */
const SCOPE_TOKEN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;

const BASE = ['iss', 'env', 'sub', 'aud', 'iat', 'exp', 'jti'] as const;

export type RealtimeTopic = Readonly<{
  kind: 'channel' | 'meet' | 'chat';
  id: string;
}>;

type BaseClaims<Audience extends string> = {
  iss: string;
  env: SessionEnvironment;
  sub: string;
  aud: Audience;
  iat: number;
  exp: number;
  jti: string;
};

export type IdentityClaims = BaseClaims<`mount:${string}`> & {
  sid: string;
  gen: number;
  src: 'cookie' | 'bearer';
  stale: boolean;
  aal: 'aal1' | 'aal2';
  amr: AuthMethod[];
  auth_time: number;
  ipp?: string;
};
export type StepUpClaims = BaseClaims<`stepup:${string}`> & {
  sid: string;
  gen: number;
  act: 'vault.pin-eval';
  ph: string;
  nonce: string;
  aal: 'aal2';
  amr: ('totp' | 'passkey')[];
  auth_time: number;
};
export type S2sClaims = BaseClaims<`service:${string}`> & { azp: string };
export type RealtimeClaims = BaseClaims<`realtime:${string}`> & {
  sid: string;
  gen: number;
  topic: RealtimeTopic;
};
export type AccessClaims = BaseClaims<typeof ACCESS_AUDIENCE> & {
  azp: string;
  sid: string;
  scope: string;
  ws: string[];
};

export type TokenClaims = {
  identity: IdentityClaims;
  stepup: StepUpClaims;
  s2s: S2sClaims;
  realtime: RealtimeClaims;
  access: AccessClaims;
};

function bytesInRange(value: unknown, min: number, max: number): boolean {
  if (typeof value !== 'string') return false;
  const length = decodeBase64Url(value)?.length;
  return length !== undefined && length >= min && length <= max;
}

/** A realtime topic: closed `{ kind, id }`, `id` non-empty and at most 128 UTF-8 bytes. */
export function isRealtimeTopic(value: unknown): value is RealtimeTopic {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const members = Object.keys(value);
  const { kind, id } = value as Record<string, unknown>;
  return (
    members.length === 2 &&
    members.includes('kind') &&
    members.includes('id') &&
    typeof kind === 'string' &&
    REALTIME_TOPIC_KINDS.has(kind) &&
    typeof id === 'string' &&
    id.length > 0 &&
    utf8(id).length <= MAX_TOPIC_ID_BYTES
  );
}

function isServiceName(value: unknown): value is string {
  return typeof value === 'string' && SERVICE_NAME_PATTERN.test(value);
}

function isScope(value: unknown, registry: unknown): boolean {
  if (typeof value !== 'string') return false;
  const tokens = value.split(' ');
  return (
    tokens.every((token) => SCOPE_TOKEN.test(token)) &&
    new Set(tokens).size === tokens.length &&
    tokens.every((token) => inRegistry(registry, token))
  );
}

function isWorkspaceList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= MAX_WORKSPACES &&
    value.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) &&
    new Set(value).size === value.length
  );
}

function isStepUpAmr(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((method) => STEP_UP_FACTORS.has(method as string)) &&
    new Set(value).size === value.length
  );
}

const STEP_UP_MEMBERS = [
  ...BASE,
  'sid',
  'gen',
  'act',
  'ph',
  'nonce',
  'aal',
  'amr',
  'auth_time',
];

export const STEP_UP_PROFILE: ClaimProfile = Object.freeze({
  tokenClass: 'stepup',
  members: new Set(STEP_UP_MEMBERS),
  required: STEP_UP_MEMBERS,
  audience: prefixedAudience('stepup'),
  check: (claims) =>
    isUserId(claims.sub) &&
    isId16(claims.sid) &&
    isGeneration(claims.gen) &&
    typeof claims.act === 'string' &&
    STEP_UP_ACTS.includes(claims.act) &&
    bytesInRange(claims.ph, 32, 32) &&
    bytesInRange(claims.nonce, 16, 32) &&
    claims.aal === 'aal2' &&
    isStepUpAmr(claims.amr) &&
    isTimestamp(claims.auth_time)
      ? null
      : 'claims',
  lifetime: () => MAX_TOKEN_LIFETIME_SECONDS.stepup,
  timing: (claims, iat) => {
    const authTime = claims.auth_time as number;
    return authTime <= iat && authTime >= iat - STEP_UP_AUTH_WINDOW_SECONDS;
  },
});

const S2S_MEMBERS = [...BASE, 'azp'];

export const S2S_PROFILE: ClaimProfile = Object.freeze({
  tokenClass: 's2s',
  members: new Set(S2S_MEMBERS),
  required: S2S_MEMBERS,
  audience: prefixedAudience('service'),
  check: (claims, context) => {
    const { sub, azp } = claims;
    if (!isServiceName(sub) || !isServiceName(azp)) return 'claims';
    if (context.mint && (sub !== context.caller || azp !== context.caller)) {
      return 'caller';
    }
    if (sub !== azp || !inRegistry(context.services, sub)) return 'claims';
    return null;
  },
  lifetime: () => MAX_TOKEN_LIFETIME_SECONDS.s2s,
});

const REALTIME_MEMBERS = [...BASE, 'sid', 'gen', 'topic'];

export const REALTIME_PROFILE: ClaimProfile = Object.freeze({
  tokenClass: 'realtime',
  members: new Set(REALTIME_MEMBERS),
  required: REALTIME_MEMBERS,
  audience: prefixedAudience('realtime'),
  check: (claims, context) => {
    const { topic } = claims;
    if (
      !isUserId(claims.sub) ||
      !isId16(claims.sid) ||
      !isGeneration(claims.gen) ||
      !isJsonObject(topic) ||
      !isRealtimeTopic(topic)
    ) {
      return 'claims';
    }
    if (context.mint) return null;
    const expected = context.topic;
    return isRealtimeTopic(expected) &&
      expected.kind === topic.kind &&
      expected.id === topic.id
      ? null
      : 'topic';
  },
  lifetime: (claims) =>
    (claims.topic as RealtimeTopic).kind === 'channel'
      ? CHANNEL_LIFETIME_SECONDS
      : MAX_TOKEN_LIFETIME_SECONDS.realtime,
});

const ACCESS_MEMBERS = [...BASE, 'azp', 'sid', 'scope', 'ws'];

export const ACCESS_PROFILE: ClaimProfile = Object.freeze({
  tokenClass: 'access',
  members: new Set(ACCESS_MEMBERS),
  required: ACCESS_MEMBERS,
  audience: (value: string) => value === ACCESS_AUDIENCE,
  check: (claims, context) =>
    isUserId(claims.sub) &&
    isId16(claims.sid) &&
    typeof claims.azp === 'string' &&
    inRegistry(context.clients, claims.azp) &&
    isScope(claims.scope, context.scopes) &&
    isWorkspaceList(claims.ws)
      ? null
      : 'claims',
  lifetime: () => MAX_TOKEN_LIFETIME_SECONDS.access,
});

export const PROFILES: Readonly<Record<TokenClass, ClaimProfile>> =
  Object.freeze({
    identity: IDENTITY_PROFILE,
    stepup: STEP_UP_PROFILE,
    s2s: S2S_PROFILE,
    realtime: REALTIME_PROFILE,
    access: ACCESS_PROFILE,
  });
