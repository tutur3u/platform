import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import { retarget } from '@tuturuuu/start-bridge/base-path';
import type { BridgeEndpoint } from '@tuturuuu/start-bridge/endpoints';
import type { NextProxy } from '@tuturuuu/start-bridge/proxy-bridge';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CONTACTS_CENTRAL_FIRST_API_PATHS } from '@/lib/central-api-paths';

/** Resolves the configured central Web API origin for the current request. */
export type CentralOrigin = () => string;

const FORWARDED_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;

/** `/api/v1/workspaces/:wsId/x` to the bridge pattern `/api/v1/workspaces/[wsId]/x`. */
export function toBridgePattern(path: string) {
  return path.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, '[$1]');
}

/** The app-relative copy of a forwarded request, addressed to its own origin. */
function appRelative(request: NextRequest, path: string, search: string) {
  return retarget(request, new URL(`${path}${search}`, request.url));
}

/**
 * Endpoints for the central-first paths. Their static segments sort ahead of
 * the local dynamic routes they shadow, matching Next's `beforeFiles`
 * precedence. Prepend them to the generated registry.
 */
export function centralFirstEndpoints(
  centralOrigin: CentralOrigin
): BridgeEndpoint[] {
  const forward = (request: NextRequest) =>
    forwardToCentralApi(
      appRelative(request, request.nextUrl.pathname, request.nextUrl.search),
      centralOrigin()
    );
  const module = Object.fromEntries(
    FORWARDED_METHODS.map((method) => [method, forward])
  );
  return CONTACTS_CENTRAL_FIRST_API_PATHS.map((path) => ({
    pattern: toBridgePattern(path),
    module,
  }));
}

/**
 * Next proxies an external `NextResponse.rewrite()` server-side; the bridge
 * accepts same-origin rewrites only. This wrapper forwards a rewrite that
 * targets the configured central Web API origin and keeps the cookies the
 * middleware wrote. Rewrites to any other origin are left for the bridge to
 * reject.
 */
export function withCentralApiRewrites(
  proxy: NextProxy,
  centralOrigin: CentralOrigin
): NextProxy {
  return async (request) => {
    const middleware = await proxy(request);
    const rewrite = middleware.headers.get('x-middleware-rewrite');
    if (!rewrite) return middleware;
    const destination = new URL(rewrite, request.url);
    if (destination.origin === request.nextUrl.origin) return middleware;
    const origin = centralOrigin();
    if (destination.origin !== new URL(origin).origin) return middleware;

    const upstream = await forwardToCentralApi(
      appRelative(request, destination.pathname, destination.search),
      origin
    );
    const response = new NextResponse(upstream.body, upstream);
    for (const cookie of middleware.headers.getSetCookie())
      response.headers.append('set-cookie', cookie);
    return response;
  };
}
