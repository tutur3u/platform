import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { NextResponse } from 'next/dist/server/web/spec-extension/response';
import {
  type BridgeRequestContext,
  withBridgeRequest,
} from '../core/request-context';

export type NextProxy = (request: NextRequest) => Promise<NextResponse>;
export type BridgeDispatch = (request: NextRequest) => Promise<Response>;

function appendCookies(from: Headers, to: Headers) {
  for (const value of from.getSetCookie()) to.append('set-cookie', value);
}

/** The default Next middleware matcher used by the Tuturuuu satellites. */
export function defaultProxyMatches(pathname: string) {
  return (
    !/^\/(?:_next\/(?:static|image)|favicon\.ico|robots\.txt|sitemap\.xml|site\.webmanifest|monitoring)/u.test(
      pathname
    ) && !/\.(?:svg|png|jpg|jpeg|pdf|gif|webp)$/u.test(pathname)
  );
}

/** Wraps a Request for Next, carrying the app basePath as Next would. */
export function toNextRequest(
  input: Request | URL | string,
  init?: RequestInit,
  basePath = ''
) {
  return new NextRequest(input, {
    ...init,
    nextConfig: basePath ? { basePath } : undefined,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

/** Plain init for the forwarded request; the body stream moves, never replays. */
export function forwardedRequestInit(
  initial: Request,
  headers: Headers
): RequestInit {
  const init: RequestInit & { duplex?: 'half' } = {
    method: initial.method,
    headers,
    body: initial.body,
    signal: initial.signal,
    redirect: initial.redirect,
  };
  if (initial.body) init.duplex = 'half';
  return init;
}

export interface ProxyBridgeOptions {
  request: Request;
  /** The app's `proxy.ts` (Next middleware) export. */
  proxy: NextProxy;
  /** Owns the forwarded request: endpoint registry, central API, Start. */
  dispatch: BridgeDispatch;
  waitUntil?: (work: Promise<unknown>) => void;
  cloudflare?: BridgeRequestContext['cloudflare'];
  observeNavigation?: BridgeRequestContext['observeNavigation'];
  locals?: BridgeRequestContext['locals'];
  /** Middleware matcher over the app-relative pathname. */
  matches?: (pathname: string) => boolean;
  /** Next `basePath`; `nextUrl.pathname` is then app-relative. */
  basePath?: string;
  /** Builds the forwarded request init (headers already merged). */
  requestInit?: (initial: Request, headers: Headers) => RequestInit;
}

/**
 * Runs a Next middleware (`proxy.ts`) in front of a Start request with Next's
 * protocol: terminal responses short-circuit, `x-middleware-next` continues,
 * `x-middleware-rewrite` re-targets (same origin only), and
 * `x-middleware-override-headers` replaces the forwarded request headers.
 * Cookies written by middleware and by app code during dispatch are all
 * returned; middleware response headers override the dispatched ones.
 */
export async function dispatchThroughProxy({
  request,
  proxy,
  dispatch,
  waitUntil,
  cloudflare,
  observeNavigation,
  locals = new Map(),
  matches = defaultProxyMatches,
  basePath = '',
  requestInit = forwardedRequestInit,
}: ProxyBridgeOptions) {
  const initial = toNextRequest(request, undefined, basePath);
  const responseHeaders = new Headers();
  const context = {
    responseHeaders,
    waitUntil,
    cloudflare,
    observeNavigation,
    locals,
  };
  return withBridgeRequest(
    { ...context, request: initial, cookieSource: initial.headers },
    async () => {
      const middleware = matches(initial.nextUrl.pathname)
        ? await proxy(initial)
        : null;
      if (
        middleware &&
        !middleware.headers.has('x-middleware-next') &&
        !middleware.headers.has('x-middleware-rewrite')
      ) {
        if (middleware.status >= 400) return middleware;
        appendCookies(responseHeaders, middleware.headers);
        return middleware;
      }

      const forwarded = new Headers(initial.headers);
      const overridden = middleware?.headers.get(
        'x-middleware-override-headers'
      );
      if (overridden !== null && overridden !== undefined) {
        const names = new Set(
          overridden.split(',').map((name) => name.trim().toLowerCase())
        );
        for (const name of [...forwarded.keys()])
          if (!names.has(name)) forwarded.delete(name);
        for (const name of names) {
          const value = middleware?.headers.get(`x-middleware-request-${name}`);
          if (value !== null && value !== undefined) forwarded.set(name, value);
        }
      }
      const rewrite = middleware?.headers.get('x-middleware-rewrite');
      const destination = rewrite
        ? new URL(rewrite, initial.url)
        : new URL(initial.url);
      if (destination.origin !== initial.nextUrl.origin)
        throw new Error('Unexpected external middleware rewrite');
      const next = toNextRequest(
        destination,
        requestInit(initial, forwarded),
        basePath
      );
      const result = await withBridgeRequest(
        { ...context, request: next, cookieSource: next.headers },
        () => dispatch(next)
      );
      const merged = new Headers(result.headers);
      if (middleware) {
        for (const [name, value] of middleware.headers) {
          if (name !== 'set-cookie' && !name.startsWith('x-middleware-'))
            merged.set(name, value);
        }
        appendCookies(middleware.headers, merged);
      }
      for (const [name, value] of responseHeaders)
        if (name !== 'set-cookie') merged.set(name, value);
      appendCookies(responseHeaders, merged);
      const response = new Response(result.body, result);
      for (const name of [...response.headers.keys()])
        response.headers.delete(name);
      for (const [name, value] of merged)
        if (name !== 'set-cookie') response.headers.set(name, value);
      appendCookies(merged, response.headers);
      return response;
    }
  );
}
