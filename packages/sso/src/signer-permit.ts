/**
 * The signer permit's wire form, shared by the finalization path that
 * issues permits and the signer Worker that verifies them. Portable:
 * WebCrypto and `TextEncoder` only, no Node or framework imports.
 *
 * `canonicalJson` is RFC 8785 (JCS) restricted to objects with ASCII
 * identifier keys, well-formed strings, booleans and safe integers, with
 * `undefined` members omitted. Within that domain the output is the same in
 * any JCS implementation, so a non-JavaScript issuer can reproduce it.
 */

export const PERMIT_FIELDS_DOMAIN = 'ttr-sso-permit-fields-v1';
export const PERMIT_DOMAIN = 'ttr-sso-permit-v1';

const KEY = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
const LONE_SURROGATE = /\p{Cs}/u;
const encoder = new TextEncoder();

export type PermitClaims = Readonly<{
  v: 1;
  id: string;
  kid: string;
  iat: number;
  exp: number;
  fields: string;
}>;

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function canonicalJson(value: unknown): string {
  if (typeof value === 'string') {
    if (LONE_SURROGATE.test(value)) {
      throw new TypeError('canonicalJson: ill-formed string');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined);
    if (!keys.every((key) => KEY.test(key))) {
      throw new TypeError('canonicalJson: unsupported key');
    }
    // ASCII keys: UTF-16 code-unit order (JCS) equals byte order.
    keys.sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('canonicalJson: unsupported value');
}

/** Base64url SHA-256 of the fields domain, a newline and the canonical JSON. */
export async function fieldsHash(fields: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${PERMIT_FIELDS_DOMAIN}\n${canonicalJson(fields)}`)
  );
  return encodeBase64Url(new Uint8Array(digest));
}

/** The bytes the Ed25519 permit signature covers. */
export function permitMessage(claims: PermitClaims): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `${PERMIT_DOMAIN}\n${JSON.stringify([claims.v, claims.id, claims.kid, claims.iat, claims.exp, claims.fields])}`
  );
}
