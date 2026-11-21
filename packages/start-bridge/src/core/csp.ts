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

/**
 * The app-base global (`APP_BASE_GLOBAL` in ./app-url), repeated here so this
 * module stays import-free: Node loads it directly from app configs.
 */
export const TRUSTED_TYPES_APP_BASE_GLOBAL = '__tuturuuuAppBase';

/** Name of the one Trusted Types policy a bridged document may create. */
export const TRUSTED_TYPES_POLICY = 'default';

/**
 * Directives that make the browser route every script sink (`innerHTML`,
 * `script.src`, `eval`-style text) through the document's `default` policy
 * and refuse any other policy name, so injected code cannot mint its own.
 */
export const TRUSTED_TYPES_DIRECTIVES = [
  "require-trusted-types-for 'script'",
  `trusted-types ${TRUSTED_TYPES_POLICY}`,
].join('; ');

/**
 * Source of the head script that registers the `default` policy:
 * - HTML passes through; the nonce script policy already keeps injected
 *   markup from running.
 * - Script URLs must be same-origin and inside the app's base path, which the
 *   app-base head script publishes before any module loads.
 * - Script text is admitted only when it is byte-identical to a script the
 *   server already sent with this response's nonce. TanStack Router re-inserts
 *   its inline head scripts after hydration; any other text is refused.
 */
export const TRUSTED_TYPES_BOOTSTRAP = `(function(t){if(!t||t.defaultPolicy)return;t.createPolicy(${JSON.stringify(TRUSTED_TYPES_POLICY)},{createHTML:function(s){return s},createScriptURL:function(s){var u=new URL(s,document.baseURI),b=globalThis[${JSON.stringify(TRUSTED_TYPES_APP_BASE_GLOBAL)}]||"";if(u.origin===location.origin&&(b===""||u.pathname===b||u.pathname.indexOf(b+"/")===0))return u.href;throw new TypeError("Trusted Types: script URL outside the app")},createScript:function(s){for(var i=0,l=document.scripts;i<l.length;i++)if(l[i].nonce&&l[i].text===s)return s;throw new TypeError("Trusted Types: script text")}})})(globalThis.trustedTypes);`;
