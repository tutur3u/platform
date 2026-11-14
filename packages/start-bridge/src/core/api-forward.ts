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

/**
 * Inbound request headers forwarded to the central Web API. Every other
 * client header is dropped: central treats the satellite hop as untrusted
 * input, so only content negotiation, credentials, CSRF signals and the
 * client headers central's API handlers read pass through.
 */
export const FORWARDED_REQUEST_HEADERS = [
  // Content negotiation and conditional requests.
  'accept',
  'accept-encoding',
  'accept-language',
  'content-type',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'prefer',
  'range',
  // Credentials; central verifies them.
  'authorization',
  'cookie',
  // CSRF and same-origin checks.
  'origin',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'access-control-request-headers',
  'access-control-request-method',
  'user-agent',
  // Client headers central API handlers read, all untrusted hints.
  'idempotency-key',
  'x-abuse-challenge',
  'x-drive-auto-extract-operation',
  'x-drive-auto-extract-path',
  'x-meet-audio-batch',
  'x-mira-chat-creation',
  'x-request-id',
  'x-tuturuuu-account-action',
  'x-tuturuuu-turnstile-token',
] as const;

/**
 * Client-IP assertions and the edge origin proof. Never copied from the
 * inbound request: only a caller that mints its own values may set them
 * through `setHeaders`.
 */
export const STRIPPED_REQUEST_HEADERS = [
  'cf-connecting-ip',
  'forwarded',
  'true-client-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'x-forwarded-for',
  'x-real-ip',
  'x-tuturuuu-origin-auth',
  'x-vercel-forwarded-for',
] as const;

const forwardedRequestHeaders = new Set<string>(FORWARDED_REQUEST_HEADERS);
const strippedRequestHeaders = new Set<string>(STRIPPED_REQUEST_HEADERS);

/** Copies only the allowlisted inbound headers. */
export function allowlistedRequestHeaders(source: Headers) {
  const headers = new Headers();
  for (const [name, value] of source) {
    if (strippedRequestHeaders.has(name)) continue;
    if (forwardedRequestHeaders.has(name)) headers.append(name, value);
  }
  return headers;
}

export interface ForwardOptions {
  /**
   * Raw query string (`?a=b`) to forward verbatim. When omitted the request
   * URL's normalized `search` is used.
   */
  search?: string;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /**
   * Whether this app serves `pathname` on the request origin. A same-origin
   * central API is a loop only for paths the app itself owns; omitted, any
   * same-origin target is refused.
   */
  ownsPath?: (pathname: string) => boolean;
  /**
   * Values the caller produced itself (not client input), set after the
   * allowlist, e.g. a forwarding host derived from the request URL.
   */
  setHeaders?: HeadersInit;
  /**
   * A complete header set the caller already sanitized, used in place of
   * the allowlist. Only whole-site proxies that strip and re-mint client-IP
   * claims and the origin proof themselves may pass it.
   */
  callerSanitizedHeaders?: Headers;
}

/**
 * Validates a configured central Web API origin: an http(s) origin with no
 * credentials or path. A same-origin target is refused when it would come
 * back to this app (a loop): always without `ownsPath`, otherwise only for
 * paths the app owns. Mounted apps share `tuturuuu.com` with Web but own only
 * `/<app>/*`, so their base-stripped `/api/*` reaches Web.
 */
export function centralApiOrigin(
  webOrigin: string,
  requestUrl: URL,
  ownsPath?: (pathname: string) => boolean
) {
  const origin = new URL(webOrigin);
  const loops =
    origin.origin === requestUrl.origin &&
    (ownsPath ? ownsPath(requestUrl.pathname) : true);
  if (
    loops ||
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
 * redirects, only allowlisted request headers, hop-by-hop headers removed
 * both ways and every upstream `Set-Cookie` retained individually.
 */
export async function forwardToCentralApi(
  request: Request,
  webOrigin: string,
  options: ForwardOptions = {}
) {
  const url = new URL(request.url);
  const origin = centralApiOrigin(webOrigin, url, options.ownsPath);
  if (!origin)
    return new Response('Invalid central API origin', { status: 503 });
  let target: string | URL;
  if (options.search === undefined) {
    origin.pathname = url.pathname;
    origin.search = url.search;
    target = origin;
  } else target = `${origin.origin}${url.pathname}${options.search}`;
  const headers = options.callerSanitizedHeaders
    ? new Headers(options.callerSanitizedHeaders)
    : allowlistedRequestHeaders(request.headers);
  for (const [name, value] of new Headers(options.setHeaders))
    headers.set(name, value);
  for (const name of [...HOP_BY_HOP_HEADERS, 'host', 'content-length'])
    headers.delete(name);
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    signal: request.signal,
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
