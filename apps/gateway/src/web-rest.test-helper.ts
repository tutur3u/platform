import type { ServiceBinding } from './worker';

/**
 * A web-rest family binding for handler tests. It forwards the family request
 * to the global `fetch`, so a test that stubs `fetch` observes Web requests
 * the same way it observes HTTP origin requests (Marketing).
 */
export function webRestBinding(): ServiceBinding {
  return { fetch: (request: Request) => globalThis.fetch(request) };
}

/** Env entries that bind the fallback web-rest family. */
export function withWebRest() {
  return { WEB_FAMILY_WEB_REST: webRestBinding() };
}
