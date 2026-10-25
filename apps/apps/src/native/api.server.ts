import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { createBuildInfoHandler } from '@tuturuuu/utils/build-info-route';
import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import { NextRequest } from '@tuturuuu/start-bridge/next/server';

export async function apiRequest(
  request: Request,
  webOrigin: string,
  fetcher: typeof fetch = fetch
) {
  const guardRequest = new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.clone().body,
    redirect: request.redirect,
    signal: request.signal,
    duplex: 'half',
  });
  const guard = await guardApiProxyRequest(guardRequest, {
    prefixBase: 'proxy:apps:api',
  });
  if (guard) return guard;
  const url = new URL(request.url);
  if (url.pathname === '/api/build-info') {
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: { Allow: 'GET, HEAD, OPTIONS' },
      });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, HEAD, OPTIONS' },
      });
    return createBuildInfoHandler('apps')();
  }
  return forwardToCentralApi(request, webOrigin, { fetcher });
}
