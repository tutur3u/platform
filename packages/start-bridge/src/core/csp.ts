/**
 * Per-response CSP script nonces. The Worker handler creates one nonce per
 * request, keeps it in the request context, and sends it in the
 * `Content-Security-Policy` header; the router (`ssr: { nonce }`) and the
 * bridge head script stamp it on every script they render. This module has
 * no Node imports, so router setup shared with the browser may use it.
 */
import { SPECULATION_RULES_TEXT } from './speculation-rules';

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

/**
 * Lets a page compile WebAssembly without allowing JavaScript `eval`. The
 * in-browser code formatters are WebAssembly modules, so Meet needs it; no
 * other app does.
 */
export const WASM_COMPILE_SOURCE = "'wasm-unsafe-eval'";

/** Script sources an app may add to the strict policy; nothing else is accepted. */
const ALLOWED_EXTRA_SCRIPT_SOURCES: ReadonlySet<string> = new Set([
  WASM_COMPILE_SOURCE,
]);

/**
 * The strict script policy for bridged apps with the extra script sources the
 * caller names. Only {@link WASM_COMPILE_SOURCE} is accepted: any other source,
 * every other `unsafe-*` keyword and every host included, throws, so no app can
 * widen the policy through this builder.
 */
export function contentSecurityPolicy(
  nonce: string,
  options: { extraScriptSources?: readonly string[] } = {}
): string {
  const extra = options.extraScriptSources ?? [];
  for (const source of extra)
    if (!ALLOWED_EXTRA_SCRIPT_SOURCES.has(source))
      throw new Error(`script-src may not add ${source}`);
  return [
    [`script-src 'nonce-${nonce}' 'strict-dynamic'`, ...new Set(extra)].join(
      ' '
    ),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** A strict script policy for bridged apps; extend per app as needed. */
export function defaultContentSecurityPolicy(nonce: string): string {
  return contentSecurityPolicy(nonce);
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
 * - Script URLs must be same-origin and inside the app's base path, or match
 *   an explicitly configured external URL exactly, query included.
 * - Script text is admitted only when it is one of the head scripts the
 *   server renders: this bootstrap (its own `currentScript` text), the
 *   app-base script for the published base, and the constant Speculation
 *   Rules for any client copy of that script. TanStack Router unmounts the
 *   JavaScript head scripts after hydration and re-inserts copies through
 *   `textContent` on client navigation. Nothing is learned from the DOM,
 *   so injected markup cannot enroll text; any other text is refused.
 */
export function trustedTypesBootstrap(scriptUrls: readonly string[] = []) {
  const external = JSON.stringify(scriptUrls).replace(/</gu, '\\u003c');
  const speculation = JSON.stringify(SPECULATION_RULES_TEXT).replace(
    /</gu,
    '\\u003c'
  );
  return `(function(t){if(!t||t.defaultPolicy)return;var c=document.currentScript,k=${JSON.stringify(TRUSTED_TYPES_APP_BASE_GLOBAL)},b=globalThis[k]||"",x=${external},a=["globalThis."+k+"="+JSON.stringify(b).replace(/</g,"\\\\u003c")+";",${speculation}];if(c&&c.text)a.push(c.text);t.createPolicy(${JSON.stringify(TRUSTED_TYPES_POLICY)},{createHTML:function(s){return s},createScriptURL:function(s){var u=new URL(s,document.baseURI);if(x.indexOf(u.href)!==-1||u.origin===location.origin&&(b===""||u.pathname===b||u.pathname.indexOf(b+"/")===0))return u.href;throw new TypeError("Trusted Types: script URL outside the app")},createScript:function(s){if(a.indexOf(s)>=0)return s;throw new TypeError("Trusted Types: script text")}})})(globalThis.trustedTypes);`;
}

export const TRUSTED_TYPES_BOOTSTRAP = trustedTypesBootstrap();
