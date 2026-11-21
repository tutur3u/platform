/**
 * The verification core shared by every token class. It checks the compact
 * encoding, the header, the injected key lookup, the ES256 signature and key
 * acceptance, and hands the parsed claims to a class profile. It holds no
 * signing capability and draws no randomness, so `./verify` can reach it.
 */
import {
  decodeBase64Url,
  isJsonObject,
  type JsonValue,
  parseStrictJson,
  utf8,
} from './encoding';
import { MAX_ASSERTION_LIFETIME_SECONDS } from './expiry';

export type TokenClass = 'identity' | 'stepup' | 's2s' | 'realtime' | 'access';

export const TOKEN_CLASSES: readonly TokenClass[] = Object.freeze([
  'identity',
  'stepup',
  's2s',
  'realtime',
  'access',
]);

/** The header `typ` of each class. */
export const TOKEN_TYPES: Readonly<Record<TokenClass, string>> = Object.freeze({
  identity: 'ttr+identity',
  stepup: 'ttr+stepup',
  s2s: 'ttr+s2s',
  realtime: 'ttr+realtime',
  access: 'ttr+access',
});

/** The largest lifetime cap of each class, in seconds. */
export const MAX_TOKEN_LIFETIME_SECONDS: Readonly<Record<TokenClass, number>> =
  Object.freeze({
    identity: MAX_ASSERTION_LIFETIME_SECONDS,
    stepup: 300,
    s2s: 300,
    realtime: 600,
    access: 300,
  });

export const MAX_TOKEN_BYTES = 4096;
export const FUTURE_IAT_TOLERANCE_SECONDS = 5;
export const KID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A trusted verification key and the lifetime it may verify within, in seconds. */
export type TokenKey = Readonly<{
  key: CryptoKey;
  class: TokenClass;
  /** The key verifies nothing issued before this. */
  notBefore: number;
  /** The key verifies nothing at or after this. */
  notAfter: number;
}>;

/** Trusted keys with their metadata. Never derived from the token. */
export type KeySource = {
  get(kid: string): Promise<TokenKey | null | 'unavailable'>;
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

export type ClaimSet = { [key: string]: JsonValue };

export type CompactResult =
  | { ok: true; kid: string; claims: ClaimSet; now: number }
  | { ok: false; reason: VerifyFailureReason };

const HEADER_MEMBERS = new Set(['alg', 'typ', 'kid']);

export function isTokenClass(value: unknown): value is TokenClass {
  return (
    typeof value === 'string' && TOKEN_CLASSES.includes(value as TokenClass)
  );
}

export function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function decodeJsonSegment(segment: string): ClaimSet | null {
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

/** Whether a key is a public P-256 ECDSA verification key. */
export function isVerifyKey(key: CryptoKey): boolean {
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

/** Reads a key lookup result once, so accessors cannot change it later. */
function readKeyRecord(value: unknown): TokenKey | null {
  if (typeof value !== 'object' || value === null) return null;
  try {
    const record = value as Record<string, unknown>;
    const key = record.key;
    const keyClass = record.class;
    const notBefore = record.notBefore;
    const notAfter = record.notAfter;
    if (
      typeof key !== 'object' ||
      key === null ||
      !isTokenClass(keyClass) ||
      !isTimestamp(notBefore) ||
      !isTimestamp(notAfter)
    ) {
      return null;
    }
    return { key: key as CryptoKey, class: keyClass, notBefore, notAfter };
  } catch {
    return null;
  }
}

const fail = (reason: VerifyFailureReason): CompactResult => ({
  ok: false,
  reason,
});

/**
 * Verifies the encoding, header, signature and key acceptance of a token of
 * `tokenClass`. Key acceptance runs after the payload is parsed: the key must
 * be of this class, `iat >= notBefore` and `now < notAfter`, or the result is
 * `unknown_key`. It never throws for a bad token and makes no network call.
 */
export async function verifyCompact(
  token: unknown,
  tokenClass: TokenClass,
  keys: KeySource,
  clock: () => number
): Promise<CompactResult> {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES) {
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
  if (typ !== TOKEN_TYPES[tokenClass]) return fail('type');

  let found: unknown;
  try {
    found = await keys.get(kid);
  } catch {
    return fail('keys_unavailable');
  }
  if (found === null) return fail('unknown_key');
  const record = found === 'unavailable' ? null : readKeyRecord(found);
  if (!record) return fail('keys_unavailable');
  if (!isVerifyKey(record.key)) return fail('key_type');

  const signature = decodeBase64Url(signatureSegment);
  if (!signature || signature.length !== 64) return fail('signature');
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      record.key,
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
  const iat = claims.iat;
  if (!isTimestamp(iat)) return fail('claims');
  const now = Math.floor(clock());
  if (!Number.isFinite(now)) return fail('time');
  if (
    record.class !== tokenClass ||
    iat < record.notBefore ||
    now >= record.notAfter
  ) {
    return fail('unknown_key');
  }
  return { ok: true, kid, claims, now };
}
