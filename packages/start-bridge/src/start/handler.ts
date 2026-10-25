import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { forwardToCentralApi } from '../core/api-forward';
import { type BasePath, createBasePath } from '../core/base-path';
import { type BridgeEndpoint, dispatchEndpoint } from '../core/endpoints';
import type { BridgeRequestContext } from '../core/request-context';
import {
  type BridgeDispatch,
  dispatchThroughProxy,
  type NextProxy,
} from '../next/proxy-bridge';

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface BridgeHandlerOptions<Env, Ctx> {
  /** Defaults to the origin root. */
  basePath?: BasePath;
  /** The TanStack Start server entry (`@tanstack/react-start/server-entry`). */
  start: { fetch(request: Request): Promise<Response> | Response };
  /** The app's `proxy.ts` export. */
  proxy: NextProxy;
  /** Generated `route.ts` registry (app-relative patterns). */
  endpoints?: readonly BridgeEndpoint[];
  /** App-relative server-function base guarded by `functionProxy`. */
  functionBase?: string;
  functionProxy?: NextProxy;
  /** App-relative static paths served from ASSETS (besides `/assets/`). */
  publicAssets?: ReadonlySet<string>;
  assets: (env: Env) => AssetsBinding | undefined;
  /** Central Web API origin for unowned `/api/*` paths. */
  centralApiOrigin: (env: Env) => string;
  /** Overrides the unowned `/api/*` forwarder. */
  forwardApi?: (request: NextRequest, origin: string) => Promise<Response>;
  matches?: (pathname: string) => boolean;
  requestInit?: (initial: Request, headers: Headers) => RequestInit;
  observeNavigation?: BridgeRequestContext['observeNavigation'];
  waitUntil?: (ctx: Ctx) => (work: Promise<unknown>) => void;
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
  const base = options.basePath ?? createBasePath({ app: 'root' });
  const publicAssets = options.publicAssets ?? new Set<string>();
  const inFunctionBase = (path: string) =>
    !!options.functionBase &&
    (path === options.functionBase ||
      path.startsWith(`${options.functionBase}/`));

  return async function handle(
    incoming: Request,
    env: Env,
    ctx: Ctx
  ): Promise<Response> {
    const appPath = base.strip(new URL(incoming.url).pathname);
    if (appPath === null) return new Response('Not Found', { status: 404 });
    const { request, adopted } = base.presentRequest(incoming);
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
        const endpoint = options.endpoints
          ? await dispatchEndpoint(options.endpoints, forwarded, { pathname })
          : null;
        if (endpoint) return endpoint;
        if (pathname === '/api' || pathname.startsWith('/api/')) {
          const origin = options.centralApiOrigin(env);
          if (options.forwardApi) return options.forwardApi(forwarded, origin);
          // The central API sees the app-relative path, never the base.
          return forwardToCentralApi(
            base.stripRequest(forwarded) ?? forwarded,
            origin
          );
        }
        // Start hydrates the browser-visible URL, not a middleware rewrite.
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
      });
    }
    return base.finalizeResponse(response, request, adopted);
  };
}
