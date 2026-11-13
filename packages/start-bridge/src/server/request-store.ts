import { installAppBaseResolver } from '../core/app-url';
import {
  type BridgeRequestStore,
  maybeBridgeRequest,
  REQUEST_STORE_KEY,
} from '../core/request-context';

type Anchor = { [REQUEST_STORE_KEY]?: BridgeRequestStore };

/**
 * Installs the runtime store once; later bundles reuse the first one. Only a
 * server adapter calls this, so only the server swaps the app base global
 * for a per-request resolver: in the browser, importing this module leaves
 * the document head script's base (a string) untouched.
 */
export function installRequestStore(store: BridgeRequestStore) {
  const anchor = globalThis as Anchor;
  anchor[REQUEST_STORE_KEY] ??= store;
  // Server-side `runtimeAppBase()` reads the current request's base.
  installAppBaseResolver(() => maybeBridgeRequest()?.appBase);
  return anchor[REQUEST_STORE_KEY];
}
