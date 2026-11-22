import { APP_BASE_GLOBAL, runtimeAppBase, withAppBase } from '../core/app-url';
import { requestNonce, trustedTypesBootstrap } from '../core/csp';

export {
  appPath,
  appRelativePathname,
  appUrl,
  runtimeAppBase,
  withAppBase,
} from '../core/app-url';
export { createNonce, requestNonce } from '../core/csp';

/** @deprecated Use `runtimeAppBase`; kept for the v0 export surface. */
export const appBasePath = runtimeAppBase;

/** TanStack Router `basepath` for the current request or document. */
export function routerBasepath(): string {
  return runtimeAppBase() || '/';
}

/**
 * Head script that hands the request's base to the browser before
 * hydration. Add it first in the root route `head().scripts`.
 */
export function appBaseHeadScript(
  basePath = runtimeAppBase(),
  nonce = requestNonce()
) {
  const value = JSON.stringify(basePath).replace(/</gu, '\\u003c');
  return {
    children: `globalThis.${APP_BASE_GLOBAL}=${value};`,
    ...(nonce ? { nonce } : {}),
  };
}

/**
 * `createStart({ serverFns: { fetch } })`: sends compiled server-function
 * URLs (`/_serverFn/...`) through the mounted base in the browser.
 */
// Cast, not annotated: runtimes that add members to `fetch` (Bun's
// `preconnect`) would otherwise reject a plain function.
export const bridgeServerFnFetch = ((
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  if (typeof input === 'string') return fetch(withAppBase(input), init);
  if (input instanceof URL) {
    const url = new URL(input);
    url.pathname = withAppBase(url.pathname);
    return fetch(url, init);
  }
  return fetch(input, init);
}) as typeof fetch;

/**
 * Head script that registers the document's Trusted Types `default` policy.
 * Add it directly after `appBaseHeadScript()` and before every other script
 * when the app's CSP requires Trusted Types: the policy reads the app base.
 */
export function trustedTypesHeadScript(
  nonce = requestNonce(),
  scriptUrls: readonly string[] = []
) {
  return {
    children: trustedTypesBootstrap(scriptUrls),
    ...(nonce ? { nonce } : {}),
  };
}
