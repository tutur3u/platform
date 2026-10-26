import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import { NextRequest } from '@tuturuuu/start-bridge/next/server';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';

/** The legacy `/api/:path*` proxy guard, applied before every API owner. */
export async function guardShortenerApi(request: Request) {
  const guardRequest = new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.clone().body,
    redirect: request.redirect,
    signal: request.signal,
    duplex: 'half',
  });
  return guardApiProxyRequest(guardRequest, {
    prefixBase: 'proxy:shortener:api',
  });
}

/** Forward an unowned API path to the central Web API with its raw query. */
export async function forwardCentralApi(
  request: Request,
  webOrigin: string,
  search: string,
  fetcher: typeof fetch = fetch
) {
  return forwardToCentralApi(request, webOrigin, { search, fetcher });
}
