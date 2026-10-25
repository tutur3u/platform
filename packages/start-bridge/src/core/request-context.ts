import { AsyncLocalStorage } from 'node:async_hooks';
import {
  RequestCookies,
  ResponseCookies,
} from 'next/dist/compiled/@edge-runtime/cookies';
import { installAppBaseResolver } from './app-url';

/**
 * One request's server context. A single store backs every `next/headers`,
 * `next/server` and `next/cache` port, so all bridge modules observe the same
 * request regardless of which alias imported them.
 */
export interface BridgeRequestContext {
  request: Request;
  /** Accumulates `Set-Cookie` and response headers written by app code. */
  responseHeaders: Headers;
  /** Request cookies as app code sees them, including writes this request. */
  cookieStore: RequestCookies;
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
   * Headers backing the cookie store. Defaults to a copy of the request
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

// Keyed on a global Symbol so every bundled copy of this module (SSR, the
// RSC environment, client-safe readers) observes the same request.
const STORAGE_KEY = Symbol.for('tuturuuu.start-bridge.request-context');
const anchor = globalThis as {
  [STORAGE_KEY]?: AsyncLocalStorage<BridgeRequestContext>;
};
if (!anchor[STORAGE_KEY])
  anchor[STORAGE_KEY] = new AsyncLocalStorage<BridgeRequestContext>();
const storage: AsyncLocalStorage<BridgeRequestContext> = anchor[STORAGE_KEY];

// Server-side `runtimeAppBase()` reads the current request's base.
installAppBaseResolver(() => storage.getStore()?.appBase);

export function withBridgeRequest<T>(
  init: Request | BridgeRequestInit,
  run: () => T
): T {
  const options = init instanceof Request ? { request: init } : init;
  return storage.run(
    {
      request: options.request,
      responseHeaders: options.responseHeaders ?? new Headers(),
      cookieStore: new RequestCookies(
        options.cookieSource ?? new Headers(options.request.headers)
      ),
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
  const context = storage.getStore();
  if (!context) throw new Error('Start bridge request context unavailable');
  return context;
}

export function maybeBridgeRequest(): BridgeRequestContext | undefined {
  return storage.getStore();
}

/** A typed per-request slot, e.g. a Worker-resolved page model. */
export function createRequestLocal<T>(description: string) {
  const key = Symbol(description);
  return {
    get: (): T | undefined => storage.getStore()?.locals.get(key) as T,
    set: (value: T) => {
      bridgeRequest().locals.set(key, value);
    },
  };
}

export async function headers() {
  return new Headers(bridgeRequest().request.headers);
}

export async function cookies() {
  const context = bridgeRequest();
  const incoming = context.cookieStore;
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
  return result;
}
