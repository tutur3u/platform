// The rules live in csp.ts, which Node loads with native type stripping and
// therefore keeps free of relative imports; this module re-exports them.
export { SPECULATION_RULES, SPECULATION_RULES_TEXT } from './csp';

const PREFETCH_PURPOSE = /(^|[\s,;])prefetch([\s,;]|$)/iu;

/** Whether a request is a browser speculative prefetch or prerender. */
export function isSpeculativeRequest(request: Request) {
  const purpose =
    request.headers.get('Sec-Purpose') ?? request.headers.get('Purpose');
  return !!purpose && PREFETCH_PURPOSE.test(purpose);
}

const SPECULATION_FLAG = 'TUTURUUU_SPECULATION_RULES';
export const SPECULATION_SCRIPT_ATTRIBUTE = 'data-tuturuuu-speculation';
const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');

type EnvStore = {
  getStore(): { cloudflare?: { env?: unknown } } | undefined;
};

function speculationOff(env: unknown) {
  const flag = (env as Record<string, unknown> | undefined)?.[SPECULATION_FLAG];
  return typeof flag === 'string' && flag.trim().toLowerCase() === 'off';
}

let renderedByServer: boolean | undefined;

/**
 * Whether this document renders the rules. The server reads
 * `TUTURUUU_SPECULATION_RULES` from the request's Worker environment; the
 * browser keeps whatever the server rendered, captured once at hydration,
 * so head re-evaluation never adds rules the server withheld.
 */
export function speculationRulesEnabled(): boolean {
  if (typeof document !== 'undefined') {
    renderedByServer ??= !!document.querySelector(
      `script[type="speculationrules"][${SPECULATION_SCRIPT_ATTRIBUTE}]`
    );
    return renderedByServer;
  }
  const store = (globalThis as { [REQUEST_STORE]?: EnvStore })[REQUEST_STORE];
  return !speculationOff(store?.getStore()?.cloudflare?.env);
}

/**
 * Stop fence for speculative traffic. `TUTURUUU_SPECULATION_RULES=off` stops
 * an app from rendering the rules, so its pages trigger no prefetches. A
 * prefetch that still reaches the app (a page rendered before the flag
 * changed) is refused with a 503 before any session or render work.
 */
export function refuseSpeculativeRequest(
  request: Request,
  env: unknown
): Response | null {
  if (!isSpeculativeRequest(request) || !speculationOff(env)) return null;
  return new Response(null, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
