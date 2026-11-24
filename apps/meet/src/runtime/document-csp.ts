import {
  contentSecurityPolicy,
  WASM_COMPILE_SOURCE,
} from '@tuturuuu/start-bridge/csp';

let warnedUpstreamPolicy = false;

/**
 * Enforces Meet's mounted document policy on an HTML response.
 *
 * Meet alone adds 'wasm-unsafe-eval', for its WebAssembly code formatters. A
 * policy already set upstream is kept unchanged rather than merged: widening
 * another layer's policy here could weaken it. When that kept policy lacks
 * 'wasm-unsafe-eval' the formatters cannot load, so the Worker warns once per
 * isolate instead of failing silently.
 */
export function withMeetDocumentCsp(
  response: Response,
  nonce: string | undefined
): Response {
  if (!nonce || !response.headers.get('content-type')?.startsWith('text/html'))
    return response;
  const upstream = response.headers.get('content-security-policy');
  if (upstream !== null) {
    if (!upstream.includes(WASM_COMPILE_SOURCE) && !warnedUpstreamPolicy) {
      warnedUpstreamPolicy = true;
      console.warn(
        `[meet] Kept an upstream Content-Security-Policy without ${WASM_COMPILE_SOURCE}; WebAssembly code formatters will be blocked.`
      );
    }
    return response;
  }
  const secured = new Response(response.body, response);
  secured.headers.set(
    'content-security-policy',
    contentSecurityPolicy(nonce, { extraScriptSources: [WASM_COMPILE_SOURCE] })
  );
  return secured;
}

/** Test hook: the once-per-isolate warning starts unsent again. */
export function resetMeetDocumentCspWarning() {
  warnedUpstreamPolicy = false;
}
