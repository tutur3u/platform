import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';
import { installAppBaseResolver } from './app-url';

/**
 * One request's server context, framework- and runtime-independent. The
 * server adapter (`@tuturuuu/start-bridge/request-context`) installs the
 * AsyncLocalStorage-backed store and Next's cookie API; this core only
 * depends on a `BridgeRequestStore` found under a global Symbol, so every
 * bundled copy (SSR, an RSC environment, client-safe readers) shares it.
 */
export interface BridgeRequestContext {
  request: Request;
  /** Accumulates `Set-Cookie` and response headers written by app code. */
  responseHeaders: Headers;
  /** Headers backing the request cookie view (writes flow into them). */
  cookieSource: Headers;
  /** Adapter-owned cookie view, created on first use. */
  cookieJar?: unknown;
  waitUntil?: (work: Promise<unknown>) => void;
  cloudflare?: { env: unknown; ctx: unknown };
  /** Observes `redirect()` calls (diagnostics only; never replaces them). */
  observeNavigation?: (href: string, result: unknown) => void;
  /** This request's resolved app base (`''` at a host root, `/meet`). */
  appBase?: string;
  /** Root-layout params (e.g. `locale`) for `next/root-params`. */
  rootParams?: Record<string, string>;
  /** This response's CSP script nonce (see `createBridgeHandler` `csp`). */
  nonce?: string;
  /** App-owned per-request values; see `createRequestLocal`. */
  locals: Map<symbol, unknown>;
}

export interface BridgeRequestInit {
  request: Request;
  responseHeaders?: Headers;
  /**
   * Headers backing the cookie view. Defaults to a copy of the request
   * headers; pass a mutable request's own headers to let cookie writes flow
   * into a forwarded request (the proxy bridge does this).
   */
  cookieSource?: Headers;
  waitUntil?: (work: Promise<unknown>) => void;
  cloudflare?: { env: unknown; ctx: unknown };
  observeNavigation?: (href: string, result: unknown) => void;
  appBase?: string;
  rootParams?: Record<string, string>;
  nonce?: string;
  locals?: Map<symbol, unknown>;
}

/** The async-context contract a runtime adapter provides. */
export interface BridgeRequestStore {
  run<T>(context: BridgeRequestContext, run: () => T): T;
  getStore(): BridgeRequestContext | undefined;
}

export const REQUEST_STORE_KEY = Symbol.for(
  'tuturuuu.start-bridge.request-context'
);
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
  installAppBaseResolver(() => currentStore()?.getStore()?.appBase);
  return anchor[REQUEST_STORE_KEY];
}

function currentStore(): BridgeRequestStore | undefined {
  return (globalThis as Anchor)[REQUEST_STORE_KEY];
}

export function withBridgeRequest<T>(
  init: Request | BridgeRequestInit,
  run: () => T
): T {
  const options = init instanceof Request ? { request: init } : init;
  const store = currentStore();
  if (!store)
    throw new Error(
      'Start bridge request store is not installed; import @tuturuuu/start-bridge/request-context'
    );
  return store.run(
    {
      request: options.request,
      responseHeaders: options.responseHeaders ?? new Headers(),
      cookieSource:
        options.cookieSource ?? new Headers(options.request.headers),
      waitUntil: options.waitUntil,
      cloudflare: options.cloudflare,
      observeNavigation: options.observeNavigation,
      appBase: options.appBase,
      rootParams: options.rootParams,
      nonce: options.nonce,
      locals: options.locals ?? new Map(),
    },
    run
  );
}

export function bridgeRequest(): BridgeRequestContext {
  const context = currentStore()?.getStore();
  if (!context) throw new Error('Start bridge request context unavailable');
  return context;
}

export function maybeBridgeRequest(): BridgeRequestContext | undefined {
  return currentStore()?.getStore();
}

/** A typed per-request slot, e.g. a Worker-resolved page model. */
export function createRequestLocal<T>(description: string) {
  const key = Symbol(description);
  return {
    get: (): T | undefined => currentStore()?.getStore()?.locals.get(key) as T,
    set: (value: T) => {
      bridgeRequest().locals.set(key, value);
    },
  };
}

export async function headers() {
  return new Headers(bridgeRequest().request.headers);
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}

/** Start pages are request-rendered; access outside a request fails closed. */
export async function connection() {
  bridgeRequest();
}

export function after(task: Promise<unknown> | (() => unknown)) {
  const context = bridgeRequest();
  if (!context.waitUntil)
    throw new Error('Start bridge after() requires a waitUntil binding');
  context.waitUntil(
    Promise.resolve().then(() => (typeof task === 'function' ? task() : task))
  );
}

/** Copies a response and appends every cookie app code wrote this request. */
export function appendContextCookies(response: Response) {
  const result = new Response(response.body, response);
  for (const cookie of bridgeRequest().responseHeaders.getSetCookie())
    result.headers.append('Set-Cookie', cookie);
  return enforceStagingCookiePolicy(bridgeRequest().request, result);
}
