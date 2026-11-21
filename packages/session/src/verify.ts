import {
  decodeBase64Url,
  hasOwn,
  isJsonObject,
  type JsonValue,
  parseStrictJson,
  utf8,
} from './encoding';
import { MAX_ASSERTION_LIFETIME_SECONDS } from './expiry';
import { AUTH_METHODS, type AuthMethod } from './auth-methods';
import type {
  SessionEnvironment,
  UserId,
  VerifiedAssertion,
} from './principal';

export type { VerifiedAssertion } from './principal';

export const IDENTITY_ASSERTION_TYPE = 'ttr+identity';
export const MAX_ASSERTION_BYTES = 4096;
export const FUTURE_IAT_TOLERANCE_SECONDS = 5;

/** Trusted public keys for the identity class. Never derived from the token. */
export type KeySource = {
  get(kid: string): Promise<CryptoKey | null | 'unavailable'>;
};

export type VerifyFailureReason =
  | 'malformed'
  | 'header'
  | 'signature'
  | 'issuer'
  | 'environment'
  | 'audience'
  | 'type'
  | 'time'
  | 'claims'
  | 'unknown_key'
  | 'key_type'
  | 'keys_unavailable';

export type VerifyResult =
  | { ok: true; assertion: VerifiedAssertion }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyOptions = {
  issuer: string;
  environment: SessionEnvironment;
  audience: `mount:${string}`;
  keys: KeySource;
  /** Current time in seconds. */
  now: () => number;
};

const HEADER_MEMBERS = new Set(['alg', 'typ', 'kid']);
const REQUIRED_CLAIMS = [
  'iss',
  'env',
  'aud',
  'sub',
  'sid',
  'gen',
  'src',
  'stale',
  'aal',
  'amr',
  'auth_time',
  'iat',
  'exp',
  'jti',
] as const;
const CLAIM_MEMBERS = new Set<string>([...REQUIRED_CLAIMS, 'ipp']);
const ENVIRONMENTS = new Set<string>(['production', 'staging', 'local']);
const KID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IPV4_PREFIX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/;

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

function decodeJsonSegment(
  segment: string
): { [key: string]: JsonValue } | null {
  const bytes = decodeBase64Url(segment);
  if (!bytes) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const value = parseStrictJson(text);
  return isJsonObject(value) ? value : null;
}

function isTimestamp(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIdentityKey(key: CryptoKey): boolean {
  try {
    const algorithm = key.algorithm as
      | { name?: unknown; namedCurve?: unknown }
      | undefined;
    return (
      key.type === 'public' &&
      typeof algorithm === 'object' &&
      algorithm !== null &&
      algorithm.name === 'ECDSA' &&
      algorithm.namedCurve === 'P-256' &&
      Array.isArray(key.usages) &&
      key.usages.includes('verify')
    );
  } catch {
    return false;
  }
}

/** A 16-byte identifier in canonical base64url. */
function isId16(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && decodeBase64Url(value)?.length === 16;
}

/** Expands an IPv6 address to eight hextets, or null if it is not one. */
function ipv6Hextets(address: string): number[] | null {
  if (!/^[0-9a-f:]{2,39}$/.test(address)) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':'));
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...tail,
  ];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

/** RFC 5952 text for eight hextets: lowercase, no leading zeros, longest zero run as `::`. */
function canonicalIpv6(hextets: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8; start += 1) {
    let length = 0;
    while (start + length < 8 && hextets[start + length] === 0) length += 1;
    if (length > bestLength && length >= 2) {
      bestStart = start;
      bestLength = length;
    }
  }
  const text = hextets.map((group) => group.toString(16));
  if (bestStart === -1) return text.join(':');
  return `${text.slice(0, bestStart).join(':')}::${text.slice(bestStart + bestLength).join(':')}`;
}

/**
 * `ipp` is an IPv4 `/24` with a zero last octet, or an IPv6 `/48` whose host
 * bits are zero, written in canonical RFC 5952 form.
 */
function isIpPrefix(value: string): boolean {
  if (value.endsWith('/48')) {
    const hextets = ipv6Hextets(value.slice(0, -3));
    if (!hextets || hextets.slice(3).some((group) => group !== 0)) return false;
    return `${canonicalIpv6(hextets)}/48` === value;
  }
  const v4 = IPV4_PREFIX.exec(value);
  if (v4) return v4.slice(1).every((octet) => Number(octet) <= 255);
  return false;
}

function readAmr(value: JsonValue | undefined): AuthMethod[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    return null;
  const methods = new Set<AuthMethod>();
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      !AUTH_METHODS.includes(entry as AuthMethod)
    ) {
      return null;
    }
    methods.add(entry as AuthMethod);
  }
  return methods.size === value.length ? [...methods] : null;
}

/**
 * Verifies a gateway-issued identity assertion. Success proves only that a
 * trusted identity-class key signed these claims for this issuer, environment
 * and mount, inside the accepted clock window. It does not prove how the
 * request arrived, that the session is live, or that any action is allowed.
 * It never throws and makes no network call.
 */
export async function verifyIdentityAssertion(
  token: string,
  options: VerifyOptions
): Promise<VerifyResult> {
  if (typeof token !== 'string' || token.length > MAX_ASSERTION_BYTES) {
    return fail('malformed');
  }
  const segments = token.split('.');
  if (
    segments.length !== 3 ||
    segments.some((segment) => segment.length === 0)
  ) {
    return fail('malformed');
  }
  const [headerSegment = '', payloadSegment = '', signatureSegment = ''] =
    segments;

  const header = decodeJsonSegment(headerSegment);
  if (!header) return fail('malformed');
  if (Object.keys(header).some((member) => !HEADER_MEMBERS.has(member))) {
    return fail('header');
  }
  const { alg, typ, kid } = header;
  if (alg !== 'ES256' || typeof kid !== 'string' || !KID_PATTERN.test(kid)) {
    return fail('header');
  }
  if (typ !== IDENTITY_ASSERTION_TYPE) return fail('type');

  let key: CryptoKey | null | 'unavailable';
  try {
    key = await options.keys.get(kid);
  } catch {
    return fail('keys_unavailable');
  }
  if (key === null) return fail('unknown_key');
  if (key === 'unavailable' || typeof key !== 'object') {
    return fail('keys_unavailable');
  }
  if (!isIdentityKey(key)) return fail('key_type');

  const signature = decodeBase64Url(signatureSegment);
  if (!signature || signature.length !== 64) return fail('signature');
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      utf8(`${headerSegment}.${payloadSegment}`)
    );
  } catch {
    // Web Crypto throws for a key it cannot use; a mismatch returns false.
    return fail('key_type');
  }
  if (!valid) return fail('signature');

  const claims = decodeJsonSegment(payloadSegment);
  if (!claims) return fail('malformed');
  if (Object.keys(claims).some((member) => !CLAIM_MEMBERS.has(member))) {
    return fail('claims');
  }
  if (REQUIRED_CLAIMS.some((member) => !hasOwn(claims, member)))
    return fail('claims');

  if (claims.iss !== options.issuer) return fail('issuer');
  if (typeof claims.env !== 'string' || !ENVIRONMENTS.has(claims.env)) {
    return fail('claims');
  }
  if (claims.env !== options.environment) return fail('environment');
  if (claims.aud !== options.audience) return fail('audience');

  const { sub, sid, gen, src, stale, aal, jti, ipp } = claims;
  const amr = readAmr(claims.amr);
  if (
    typeof sub !== 'string' ||
    !UUID_PATTERN.test(sub) ||
    !isId16(sid) ||
    !isId16(jti) ||
    typeof gen !== 'number' ||
    !Number.isSafeInteger(gen) ||
    gen < 0 ||
    gen > 2_147_483_647 ||
    (src !== 'cookie' && src !== 'bearer') ||
    typeof stale !== 'boolean' ||
    (aal !== 'aal1' && aal !== 'aal2') ||
    amr === null ||
    (ipp !== undefined && (typeof ipp !== 'string' || !isIpPrefix(ipp)))
  ) {
    return fail('claims');
  }

  const { auth_time: authTime, iat, exp } = claims;
  if (!isTimestamp(authTime) || !isTimestamp(iat) || !isTimestamp(exp)) {
    return fail('claims');
  }
  const now = Math.floor(options.now());
  if (
    !Number.isFinite(now) ||
    authTime > iat ||
    exp <= iat ||
    exp - iat > MAX_ASSERTION_LIFETIME_SECONDS ||
    iat > now + FUTURE_IAT_TOLERANCE_SECONDS ||
    now >= exp
  ) {
    return fail('time');
  }

  return {
    ok: true,
    assertion: registerIssuedAssertion(
      Object.freeze({
        keyId: kid,
        issuer: options.issuer,
        environment: options.environment,
        audience: options.audience,
        userId: sub as UserId,
        sessionId: sid,
        generation: gen,
        source: src,
        stale,
        aal,
        amr: Object.freeze(amr),
        authTime,
        issuedAt: iat,
        expiresAt: exp,
        jwtId: jti,
        ipPrefix: typeof ipp === 'string' ? ipp : null,
      })
    ) as VerifiedAssertion,
  };
}
