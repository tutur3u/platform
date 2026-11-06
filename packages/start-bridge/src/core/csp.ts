/**
 * Per-response CSP script nonces. The Worker handler creates one nonce per
 * request, keeps it in the request context, and sends it in the
 * `Content-Security-Policy` header; the router (`ssr: { nonce }`) and the
 * bridge head script stamp it on every script they render. This module has
 * no Node imports, so router setup shared with the browser may use it.
 */
const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');

type NonceStore = { getStore(): { nonce?: string } | undefined };

/** 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The current response's nonce on the server; `undefined` in the browser. */
export function requestNonce(): string | undefined {
  const store = (globalThis as { [REQUEST_STORE]?: NonceStore })[REQUEST_STORE];
  return store?.getStore()?.nonce;
}

/** A strict script policy for bridged apps; extend per app as needed. */
export function defaultContentSecurityPolicy(nonce: string): string {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
