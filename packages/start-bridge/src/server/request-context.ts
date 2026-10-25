import { AsyncLocalStorage } from 'node:async_hooks';
import { installMountedAppSessionResolver } from '@tuturuuu/auth/app-session-mount';
import {
  RequestCookies,
  ResponseCookies,
} from 'next/dist/compiled/@edge-runtime/cookies';
import {
  type BridgeRequestContext,
  bridgeRequest,
  installRequestStore,
  maybeBridgeRequest,
} from '../core/request-context';

/**
 * Server adapter for the bridge request context: installs the
 * AsyncLocalStorage store (Workers `nodejs_compat`, Node) under the core's
 * global Symbol and provides Next's `cookies()` view. This is the public
 * `@tuturuuu/start-bridge/request-context` entry; the portable core is
 * `@tuturuuu/start-bridge/request-context/core`.
 */
installRequestStore(new AsyncLocalStorage<BridgeRequestContext>());
// Auth writers refuse app-session cookies under a mount. The base is the
// URL-derived one the handler resolved, never a client header.
installMountedAppSessionResolver(() => Boolean(maybeBridgeRequest()?.appBase));

export * from '../core/request-context';

export async function cookies() {
  const context = bridgeRequest();
  context.cookieJar ??= new RequestCookies(context.cookieSource);
  const incoming = context.cookieJar as RequestCookies;
  const outgoing = new ResponseCookies(context.responseHeaders);
  const store = {
    get: incoming.get.bind(incoming),
    getAll: incoming.getAll.bind(incoming),
    has: incoming.has.bind(incoming),
    toString: incoming.toString.bind(incoming),
    get size() {
      return incoming.size;
    },
    [Symbol.iterator]: incoming[Symbol.iterator].bind(incoming),
    set(...args: Parameters<ResponseCookies['set']>) {
      outgoing.set(...args);
      const name = typeof args[0] === 'string' ? args[0] : args[0].name;
      const cookie = outgoing.get(name);
      if (!cookie)
        throw new Error('Start bridge cookie write was not retained');
      incoming.set(cookie.name, cookie.value);
      return store;
    },
    delete(...args: Parameters<ResponseCookies['delete']>) {
      outgoing.delete(...args);
      const name = typeof args[0] === 'string' ? args[0] : args[0].name;
      incoming.delete(name);
      return store;
    },
  };
  return store;
}
