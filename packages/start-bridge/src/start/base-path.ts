import { APP_BASE_GLOBAL, runtimeAppBase, withAppBase } from '../core/app-url';
import { requestNonce } from '../core/csp';

export {
  appPath,
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
export const bridgeServerFnFetch: typeof fetch = (input, init) => {
  if (typeof input === 'string') return fetch(withAppBase(input), init);
  if (input instanceof URL) {
    const url = new URL(input);
    url.pathname = withAppBase(url.pathname);
    return fetch(url, init);
  }
  return fetch(input, init);
};
