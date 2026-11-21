/**
 * The public JWKS and the two verifier key sources: one fed by the internal
 * key set, one fed by a served JWKS. Both return only the requested class's
 * keys, with the lifetimes that key acceptance checks.
 */
import { isJsonObject, parseStrictJson } from '../encoding';
import {
  isTimestamp,
  isTokenClass,
  KID_PATTERN,
  type KeySource,
  type TokenClass,
} from '../token-core';
import type { KeySet, KeySetResult } from './key-set';
import {
  type EcPublicJwk,
  importPublicJwk,
  jwkThumbprint,
  readEcJwk,
} from './thumbprint';

export type PublicJwk = EcPublicJwk &
  Readonly<{
    kid: string;
    use: 'sig';
    alg: 'ES256';
    'ttr:class': TokenClass;
    nbf: number;
    exp: number;
  }>;

export type JwksDocument = Readonly<{ keys: readonly PublicJwk[] }>;

const JWK_MEMBERS = new Set([
  'kty',
  'crv',
  'x',
  'y',
  'kid',
  'use',
  'alg',
  'ttr:class',
  'nbf',
  'exp',
]);
const MAX_JWKS_BYTES = 256 * 1024;

/**
 * The public JWKS: `next`, `active` and `retired` keys before their
 * `notAfter`, without denied keys, sorted by class and `kid`.
 */
export function jwksDocument(keySet: KeySet, now: number): JwksDocument {
  const denied = new Set(keySet.deniedKids);
  const keys = keySet.entries
    .filter((entry) => now < entry.notAfter && !denied.has(entry.kid))
    .sort((left, right) => {
      const a = `${left.class} ${left.kid}`;
      const b = `${right.class} ${right.kid}`;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map((entry): PublicJwk =>
      Object.freeze({
        kty: 'EC',
        crv: 'P-256',
        x: entry.publicJwk.x,
        y: entry.publicJwk.y,
        kid: entry.kid,
        use: 'sig',
        alg: 'ES256',
        'ttr:class': entry.class,
        nbf: entry.notBefore,
        exp: entry.notAfter,
      })
    );
  return Object.freeze({ keys: Object.freeze(keys) });
}

export type JwksKey = Readonly<{
  kid: string;
  class: TokenClass;
  notBefore: number;
  notAfter: number;
  thumbprint: string;
  publicKey: CryptoKey;
}>;

export type ParsedJwks = Readonly<{ keys: readonly JwksKey[] }>;

/**
 * Parses a served JWKS body. A JWK without `ttr:class`, `nbf` or `exp`,
 * with any other member, or sharing its `kid` with another JWK is dropped.
 * Returns null when the body itself is not a strict JWKS.
 */
export async function parseJwks(body: string): Promise<ParsedJwks | null> {
  if (typeof body !== 'string' || body.length > MAX_JWKS_BYTES) return null;
  const parsed = parseStrictJson(body);
  if (
    !isJsonObject(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Array.isArray(parsed.keys)
  ) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const jwk of parsed.keys) {
    if (isJsonObject(jwk) && typeof jwk.kid === 'string') {
      counts.set(jwk.kid, (counts.get(jwk.kid) ?? 0) + 1);
    }
  }
  const keys: JwksKey[] = [];
  for (const jwk of parsed.keys) {
    if (!isJsonObject(jwk)) continue;
    if (Object.keys(jwk).some((member) => !JWK_MEMBERS.has(member))) continue;
    const { kid, use, alg, nbf, exp } = jwk;
    const keyClass = jwk['ttr:class'];
    if (
      typeof kid !== 'string' ||
      !KID_PATTERN.test(kid) ||
      counts.get(kid) !== 1 ||
      use !== 'sig' ||
      alg !== 'ES256' ||
      !isTokenClass(keyClass) ||
      !isTimestamp(nbf) ||
      !isTimestamp(exp)
    ) {
      continue;
    }
    const publicJwk = readEcJwk(
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      false
    );
    if (!publicJwk) continue;
    const publicKey = await importPublicJwk(publicJwk);
    if (!publicKey) continue;
    keys.push(
      Object.freeze({
        kid,
        class: keyClass,
        notBefore: nbf,
        notAfter: exp,
        thumbprint: await jwkThumbprint(publicJwk),
        publicKey,
      })
    );
  }
  return Object.freeze({ keys: Object.freeze(keys) });
}

/** A verifier key source over a parsed JWKS, for one class. */
export function keySourceFromJwks(
  jwks: ParsedJwks | null,
  tokenClass: TokenClass
): KeySource {
  return {
    get: async (kid) => {
      if (!jwks) return 'unavailable';
      const key = jwks.keys.find(
        (candidate) => candidate.kid === kid && candidate.class === tokenClass
      );
      return key
        ? {
            key: key.publicKey,
            class: key.class,
            notBefore: key.notBefore,
            notAfter: key.notAfter,
          }
        : null;
    },
  };
}

/**
 * A verifier key source over the internal key set, for one class. A failed
 * key set returns `unavailable`, which fails closed as `keys_unavailable`.
 */
export function keySourceFromKeySet(
  result: KeySetResult,
  tokenClass: TokenClass
): KeySource {
  return {
    get: async (kid) => {
      if (!result.ok) return 'unavailable';
      if (result.keySet.deniedKids.includes(kid)) return null;
      const entry = result.keySet.entries.find(
        (candidate) => candidate.kid === kid && candidate.class === tokenClass
      );
      return entry
        ? {
            key: entry.publicKey,
            class: entry.class,
            notBefore: entry.notBefore,
            notAfter: entry.notAfter,
          }
        : null;
    },
  };
}
