import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { createBuildInfoHandler } from '@tuturuuu/utils/build-info-route';
import { NextRequest } from './next-server';

const hopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];
export async function apiRequest(
  request: Request,
  webOrigin: string,
  fetcher: typeof fetch = fetch
) {
  const guard = await guardApiProxyRequest(new NextRequest(request.clone()), {
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
  const origin = new URL(webOrigin);
  if (
    origin.origin === url.origin ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    !['http:', 'https:'].includes(origin.protocol)
  ) {
    return new Response('Invalid central API origin', { status: 503 });
  }
  origin.pathname = url.pathname;
  origin.search = url.search;
  const headers = new Headers(request.headers);
  for (const name of [...hopHeaders, 'host', 'content-length'])
    headers.delete(name);
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    duplex: 'half',
  };
  const upstream = await fetcher(new Request(origin, init));
  const output = new Headers(upstream.headers);
  for (const name of hopHeaders) output.delete(name);
  output.delete('Set-Cookie');
  for (const cookie of upstream.headers.getSetCookie())
    output.append('Set-Cookie', cookie);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: output,
  });
}
