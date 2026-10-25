export const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const;

export interface ForwardOptions {
  /**
   * Raw query string (`?a=b`) to forward verbatim. When omitted the request
   * URL's normalized `search` is used.
   */
  search?: string;
  fetcher?: typeof fetch;
}

/**
 * Validates a configured central Web API origin: an http(s) origin with no
 * credentials or path, and never the request's own origin (a loop).
 */
export function centralApiOrigin(webOrigin: string, requestUrl: URL) {
  const origin = new URL(webOrigin);
  if (
    origin.origin === requestUrl.origin ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    return null;
  return origin;
}

/**
 * Forwards an unowned `/api/*` request to the central Web API with manual
 * redirects, hop-by-hop headers removed both ways and every upstream
 * `Set-Cookie` retained individually.
 */
export async function forwardToCentralApi(
  request: Request,
  webOrigin: string,
  options: ForwardOptions = {}
) {
  const url = new URL(request.url);
  const origin = centralApiOrigin(webOrigin, url);
  if (!origin)
    return new Response('Invalid central API origin', { status: 503 });
  let target: string | URL;
  if (options.search === undefined) {
    origin.pathname = url.pathname;
    origin.search = url.search;
    target = origin;
  } else target = `${origin.origin}${url.pathname}${options.search}`;
  const headers = new Headers(request.headers);
  for (const name of [...HOP_BY_HOP_HEADERS, 'host', 'content-length'])
    headers.delete(name);
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    duplex: 'half',
  };
  const upstream = await (options.fetcher ?? fetch)(new Request(target, init));
  const output = new Headers(upstream.headers);
  for (const name of HOP_BY_HOP_HEADERS) output.delete(name);
  output.delete('Set-Cookie');
  for (const cookie of upstream.headers.getSetCookie())
    output.append('Set-Cookie', cookie);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: output,
  });
}
