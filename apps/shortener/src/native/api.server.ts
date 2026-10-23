import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
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
  const url = new URL(request.url);
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
  const target = `${origin.origin}${url.pathname}${search}`;
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
  const upstream = await fetcher(new Request(target, init));
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
