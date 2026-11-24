/**
 * Request authentication for the sign entry: HMAC-SHA256 over the
 * audience (the signer environment, `SSO_SIGNER_ENV`), the method, path,
 * timestamp, a single-use nonce and the SHA-256 of the body, never a static
 * bearer. A request signed for another environment never verifies, even
 * if an operator reused a key across environments. The timestamp may differ from the Worker clock by at most
 * 60 seconds; the nonce is then claimed once in `SignerReplay`, so a replay
 * to another isolate or region is still refused.
 */
import {
  type Bytes,
  decodeBase64Url,
  encodeBase64Url,
  type KeySet,
  keysOf,
} from './key-set';

export const MAX_CLOCK_SKEW_MS = 60_000;
export const HEADER_TIMESTAMP = 'x-ttr-sso-timestamp';
export const HEADER_NONCE = 'x-ttr-sso-nonce';
export const HEADER_SIGNATURE = 'x-ttr-sso-signature';
const DOMAIN = 'ttr-sso-signer-request-v2';
const NONCE_TEXT = /^[A-Za-z0-9_-]{22,43}$/u;
const TIMESTAMP_TEXT = /^[1-9][0-9]{12}$/u;

export type RequestAuthResult =
  | Readonly<{ ok: true; nonce: string; timestampMs: number }>
  | Readonly<{ ok: false; error: 'unauthenticated' | 'misconfigured' }>;

const encoder = new TextEncoder();

export async function sha256(bytes: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function canonicalRequest(input: {
  audience: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: Bytes;
}): Promise<Bytes> {
  const bodyHash = encodeBase64Url(await sha256(input.body));
  return encoder.encode(
    [
      DOMAIN,
      input.audience,
      input.method,
      input.path,
      input.timestamp,
      input.nonce,
      bodyHash,
    ].join('\n')
  );
}

function hmacKey(raw: Bytes, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

/** Caller-side helper: the three request headers for one body. */
export async function signRequestHeaders(input: {
  key: Bytes;
  audience: string;
  method: string;
  path: string;
  body: Bytes;
  nowMs: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const timestamp = String(input.nowMs);
  const nonce =
    input.nonce ?? encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(input.key, 'sign'),
    await canonicalRequest({ ...input, timestamp, nonce })
  );
  return {
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: encodeBase64Url(new Uint8Array(signature)),
  };
}

/** Verifies the headers in constant time (WebCrypto `verify`). */
export async function verifyRequestAuth(input: {
  /** This deployment's `SSO_SIGNER_ENV`; null refuses as misconfigured. */
  audience: string | null;
  method: string;
  path: string;
  headers: Headers;
  body: Bytes;
  keys: KeySet | null;
  nowMs: number;
}): Promise<RequestAuthResult> {
  const audience = input.audience;
  if (!input.keys || !audience) return { ok: false, error: 'misconfigured' };
  const timestamp = input.headers.get(HEADER_TIMESTAMP) ?? '';
  const nonce = input.headers.get(HEADER_NONCE) ?? '';
  const signature = decodeBase64Url(input.headers.get(HEADER_SIGNATURE), 32);
  if (
    !TIMESTAMP_TEXT.test(timestamp) ||
    !NONCE_TEXT.test(nonce) ||
    signature?.length !== 32
  ) {
    return { ok: false, error: 'unauthenticated' };
  }
  const timestampMs = Number(timestamp);
  if (Math.abs(input.nowMs - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: 'unauthenticated' };
  }
  const message = await canonicalRequest({
    ...input,
    audience,
    timestamp,
    nonce,
  });
  let matched = false;
  for (const key of keysOf(input.keys)) {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(key, 'verify'),
      signature,
      message
    );
    matched ||= valid;
  }
  return matched
    ? { ok: true, nonce, timestampMs }
    : { ok: false, error: 'unauthenticated' };
}
