import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { forwardToCentralApi } from '../core/api-forward';
import { createNonce } from '../core/csp';
import { type BasePath, createBasePath } from '../core/base-path';
import { type BridgeEndpoint, dispatchEndpoint } from '../core/endpoints';
import {
  APP_BASE_HEADER,
  type AppMountConfig,
  resolveAppBase,
} from '../core/mounts';
import type { BridgeRequestContext } from '../core/request-context';
import { fromNextSourcePattern, matchRoute } from '../core/route-match';
import {
  type BridgeDispatch,
  dispatchThroughProxy,
  type NextProxy,
} from '../next/proxy-bridge';

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface BridgeHandlerOptions<Env, Ctx> {
  /** Where this artifact is served; the base is resolved per request. */
  mounts?: AppMountConfig;
  /** A fixed base (tests, single-mount apps); ignored when `mounts` is set. */
  basePath?: BasePath;
  /** The TanStack Start server entry (`@tanstack/react-start/server-entry`). */
  start: { fetch(request: Request): Promise<Response> | Response };
  /** The app's `proxy.ts` export. */
  proxy: NextProxy;
  /** Generated `route.ts` registry (app-relative patterns). */
  endpoints?: readonly BridgeEndpoint[];
  /** App-relative server-function base guarded by `functionProxy`. */
  functionBase?: string;
  /** Compiled Start `serverFns.base` (e.g. `/_serverFn`); served base-stripped. */
  serverFnBase?: string;
  functionProxy?: NextProxy;
  /** App-relative static paths served from ASSETS (besides `/assets/`). */
  publicAssets?: ReadonlySet<string>;
  assets: (env: Env) => AssetsBinding | undefined;
  /** Central Web API origin for unowned `/api/*` paths. */
  centralApiOrigin: (env: Env) => string;
  /**
   * Paths the central Web API owns ahead of the app's own routes (Next
   * `beforeFiles` rewrites). Accepts Next sources (`/api/v1/:wsId/x`) or
   * bracket patterns; matched against the app-relative path.
   */
  centralFirst?: readonly string[];
  /** Overrides the unowned `/api/*` forwarder. */
  forwardApi?: (request: NextRequest, origin: string) => Promise<Response>;
  matches?: (pathname: string) => boolean;
  requestInit?: (initial: Request, headers: Headers) => RequestInit;
  observeNavigation?: BridgeRequestContext['observeNavigation'];
  waitUntil?: (ctx: Ctx) => (work: Promise<unknown>) => void;
  /**
   * Builds the `Content-Security-Policy` for a fresh per-response script
   * nonce (e.g. `defaultContentSecurityPolicy`). The nonce is in the request
   * context (`requestNonce()`); pass it to `createRouter({ ssr: { nonce } })`.
   */
  csp?: (nonce: string) => string;
}

/**
 * The Worker `fetch` skeleton shared by bridged apps: base ownership, scoped
 * cookies, static assets, Next middleware, the endpoint registry, central API
 * forwarding and finally Start SSR at the browser-visible URL.
 */
export function createBridgeHandler<
  Env,
  Ctx extends { waitUntil(work: Promise<unknown>): void },
>(options: BridgeHandlerOptions<Env, Ctx>) {
  const fixed = options.basePath ?? createBasePath({ app: 'root' });
  const centralFirst = (options.centralFirst ?? []).map(fromNextSourcePattern);
  const isCentralFirst = (path: string) =>
    centralFirst.some((pattern) => {
      try {
        return matchRoute(pattern, path) !== null;
      } catch {
        return false;
      }
    });
  const publicAssets = options.publicAssets ?? new Set<string>();
  const inBase = (path: string, prefix: string) =>
    path === prefix || path.startsWith(`${prefix}/`);
  const inFunctionBase = (path: string) =>
    !!options.functionBase && inBase(path, options.functionBase);

  return async function handle(
    incoming: Request,
    env: Env,
    ctx: Ctx
  ): Promise<Response> {
    const url = new URL(incoming.url);
    let base = fixed;
    if (options.mounts) {
      const mount = resolveAppBase(url, options.mounts);
      if (!mount) return new Response('Not Found', { status: 404 });
      base = createBasePath({
        app: options.mounts.app,
        basePath: mount.basePath,
      });
    }
    const appPath = base.strip(url.pathname);
    if (appPath === null) return new Response('Not Found', { status: 404 });
    // The mount header is bridge-owned: never trust a client-sent copy.
    const headers = new Headers(incoming.headers);
    headers.delete(APP_BASE_HEADER);
    if (!base.isRoot) headers.set(APP_BASE_HEADER, base.basePath);
    const request = new Request(incoming, { headers });
    const nonce = options.csp ? createNonce() : undefined;
    let response: Response;
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      (appPath.startsWith('/assets/') || publicAssets.has(appPath))
    ) {
      const assets = options.assets(env);
      if (!assets) throw new Error('Assets binding is unavailable');
      response = await assets.fetch(base.stripRequest(request) ?? request);
    } else {
      const dispatch: BridgeDispatch = async (forwarded) => {
        const pathname = forwarded.nextUrl.pathname;
        const central = isCentralFirst(pathname);
        const endpoint =
          options.endpoints && !central
            ? await dispatchEndpoint(options.endpoints, forwarded, {
                pathname,
              })
            : null;
        if (endpoint) return endpoint;
        if (central || pathname === '/api' || pathname.startsWith('/api/')) {
          const origin = options.centralApiOrigin(env);
          if (options.forwardApi) return options.forwardApi(forwarded, origin);
          // The central API sees the app-relative path, never the base.
          return forwardToCentralApi(
            base.stripRequest(forwarded) ?? forwarded,
            origin,
            // Under a mount the app owns only its base; at a host root it
            // owns every path, so a same-origin central API is a loop.
            { ownsPath: (path) => base.isRoot || base.owns(path) }
          );
        }
        // Server functions are compiled against the root base; pages hydrate
        // the browser-visible URL (router basepath), not a middleware rewrite.
        if (options.serverFnBase && inBase(pathname, options.serverFnBase))
          return options.start.fetch(base.stripRequest(forwarded) ?? forwarded);
        return options.start.fetch(new Request(request.url, forwarded));
      };
      response = await dispatchThroughProxy({
        request,
        proxy:
          options.functionProxy && inFunctionBase(appPath)
            ? options.functionProxy
            : options.proxy,
        dispatch,
        basePath: base.basePath,
        waitUntil: options.waitUntil
          ? options.waitUntil(ctx)
          : (work) => ctx.waitUntil(work),
        cloudflare: { env, ctx },
        observeNavigation: options.observeNavigation,
        matches: options.matches,
        requestInit: options.requestInit,
        rewriteOrigins: [options.centralApiOrigin(env)],
        nonce,
      });
    }
    const final = base.finalizeResponse(response);
    if (!nonce || !options.csp) return final;
    const secured = new Response(final.body, final);
    secured.headers.set('Content-Security-Policy', options.csp(nonce));
    return secured;
  };
}
