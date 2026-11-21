import { decodeBase64Url, encodeBase64Url, utf8 } from '../encoding';

/** A P-256 public key as JWK: exactly these four members. */
export type EcPublicJwk = Readonly<{
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}>;

/** A P-256 private key as JWK, with its public half. */
export type EcPrivateJwk = EcPublicJwk & Readonly<{ d: string }>;

/** A canonical base64url P-256 coordinate or scalar: exactly 32 bytes. */
export function isCoordinate(value: unknown): value is string {
  return typeof value === 'string' && decodeBase64Url(value)?.length === 32;
}

/**
 * RFC 7638 thumbprint of an EC public key: SHA-256 over the canonical JSON of
 * `crv`, `kty`, `x` and `y` only, in that order with no whitespace, encoded as
 * unpadded base64url. Every other member, including any thumbprint field the
 * input carries, is ignored.
 */
export async function jwkThumbprint(jwk: {
  crv: string;
  kty: string;
  x: string;
  y: string;
}): Promise<string> {
  const { crv, kty, x, y } = jwk;
  for (const member of [crv, kty, x, y]) {
    if (typeof member !== 'string') {
      throw new TypeError('A thumbprint needs string crv, kty, x and y');
    }
  }
  const canonical = `{"crv":${JSON.stringify(crv)},"kty":${JSON.stringify(kty)},"x":${JSON.stringify(x)},"y":${JSON.stringify(y)}}`;
  const digest = await crypto.subtle.digest('SHA-256', utf8(canonical));
  return encodeBase64Url(new Uint8Array(digest));
}

/** Imports a P-256 public JWK for verification, or null when it is not one. */
export async function importPublicJwk(
  jwk: EcPublicJwk
): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }
}

/**
 * Reads a closed P-256 public JWK from parsed JSON: exactly `kty`, `crv`, `x`
 * and `y` (plus `d` when `withPrivate`), with 32-byte coordinates.
 */
export function readEcJwk(
  value: unknown,
  withPrivate: boolean
): EcPrivateJwk | EcPublicJwk | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const expected = withPrivate ? 5 : 4;
  if (Object.keys(record).length !== expected) return null;
  if (record.kty !== 'EC' || record.crv !== 'P-256') return null;
  if (!isCoordinate(record.x) || !isCoordinate(record.y)) return null;
  if (!withPrivate) {
    return { kty: 'EC', crv: 'P-256', x: record.x, y: record.y };
  }
  if (!isCoordinate(record.d)) return null;
  return { kty: 'EC', crv: 'P-256', x: record.x, y: record.y, d: record.d };
}
