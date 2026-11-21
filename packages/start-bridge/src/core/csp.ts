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
 * Source of the head script that registers the `default` policy. It runs
 * right after the app-base head script, so the app base is already known:
 * - HTML passes through; the nonce script policy already keeps injected
 *   markup from running.
 * - Script URLs must be same-origin and inside the app's base path.
 * - Script text is admitted only when it is one of the two head scripts the
 *   server renders: this bootstrap (its own `currentScript` text) and the
 *   app-base script for the published base. TanStack Router unmounts both
 *   after hydration and re-inserts copies through `textContent` on client
 *   navigation. Nothing is learned from the DOM, so injected markup cannot
 *   enroll text; any other text is refused.
 */
export const TRUSTED_TYPES_BOOTSTRAP = `(function(t){if(!t||t.defaultPolicy)return;var c=document.currentScript,k=${JSON.stringify(TRUSTED_TYPES_APP_BASE_GLOBAL)},b=globalThis[k]||"",a=["globalThis."+k+"="+JSON.stringify(b).replace(/</g,"\\\\u003c")+";"];if(c&&c.text)a.push(c.text);t.createPolicy(${JSON.stringify(TRUSTED_TYPES_POLICY)},{createHTML:function(s){return s},createScriptURL:function(s){var u=new URL(s,document.baseURI);if(u.origin===location.origin&&(b===""||u.pathname===b||u.pathname.indexOf(b+"/")===0))return u.href;throw new TypeError("Trusted Types: script URL outside the app")},createScript:function(s){if(a.indexOf(s)>=0)return s;throw new TypeError("Trusted Types: script text")}})})(globalThis.trustedTypes);`;
