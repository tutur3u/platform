import {
  compareRoutePatterns,
  matchRoute,
  type RouteParams,
} from './route-match';

export const HTTP_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** An App Router `route.ts` module as imported by a generated registry. */
export type RouteModule = Partial<Record<HttpMethod, unknown>> &
  Record<string, unknown>;

export interface BridgeEndpoint {
  /** App-relative pattern, e.g. `/api/meet-call/[meetingId]/state`. */
  pattern: string;
  module: RouteModule;
  /** Params implied by a stripped segment such as `[locale]`. */
  defaults?: Record<string, string>;
}

export interface DispatchOptions {
  /** App-relative pathname; defaults to the request URL pathname. */
  pathname?: string;
}

function methodsOf(module: RouteModule): HttpMethod[] {
  return HTTP_METHODS.filter((method) => typeof module[method] === 'function');
}

export function sortEndpoints(endpoints: readonly BridgeEndpoint[]) {
  return endpoints.toSorted((a, b) =>
    compareRoutePatterns(a.pattern, b.pattern)
  );
}

/**
 * Next route-handler semantics: `HEAD` falls back to `GET` without a body,
 * `OPTIONS` answers 204 with `Allow`, an unexported method answers 405, and a
 * malformed percent-encoded path answers 400. Returns `null` when no
 * endpoint owns the path.
 */
export async function dispatchEndpoint(
  endpoints: readonly BridgeEndpoint[],
  request: Request,
  options: DispatchOptions = {}
): Promise<Response | null> {
  const pathname = options.pathname ?? new URL(request.url).pathname;
  for (const endpoint of endpoints) {
    let params: RouteParams | null;
    try {
      params = matchRoute(endpoint.pattern, pathname);
    } catch (error) {
      if (error instanceof URIError)
        return new Response('Bad Request', { status: 400 });
      throw error;
    }
    if (!params) continue;
    const exported = methodsOf(endpoint.module);
    const allowed: string[] = [...exported];
    if (exported.includes('GET') && !exported.includes('HEAD'))
      allowed.push('HEAD');
    if (!exported.includes('OPTIONS')) allowed.push('OPTIONS');
    if (request.method === 'OPTIONS' && !exported.includes('OPTIONS'))
      return new Response(null, {
        status: 204,
        headers: { Allow: allowed.join(', ') },
      });
    const method =
      request.method === 'HEAD' && !exported.includes('HEAD')
        ? 'GET'
        : request.method;
    const handler = endpoint.module[method as HttpMethod];
    if (typeof handler !== 'function')
      return new Response(null, {
        status: 405,
        headers: { Allow: allowed.join(', ') },
      });
    const response: Response = await handler(request, {
      params: Promise.resolve({ ...endpoint.defaults, ...params }),
    });
    if (request.method === 'HEAD')
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    return response;
  }
  return null;
}

/**
 * A route module imported on its first request. `methods` are the exports
 * the codegen read statically, so `OPTIONS`/`405` answers need no import;
 * a route's dependencies (e.g. Node-only SDKs) load only when it is hit.
 */
export function lazyRouteModule(
  load: () => Promise<RouteModule>,
  methods: readonly HttpMethod[]
): RouteModule {
  let loaded: Promise<RouteModule> | undefined;
  const module: RouteModule = {};
  for (const method of methods)
    module[method] = async (...args: unknown[]) => {
      loaded ??= load();
      const handler = (await loaded)[method];
      if (typeof handler !== 'function')
        throw new Error(`Route module has no ${method} export`);
      return handler(...args);
    };
  return module;
}
