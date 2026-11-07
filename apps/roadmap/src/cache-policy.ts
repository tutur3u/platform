export const PUBLIC_DOCUMENT_CACHE =
  'public,s-maxage=300,stale-while-revalidate=86400';
export const PRIVATE_RESPONSE_CACHE = 'private,no-store';

/** Header-only policy: no cache storage, identity lookup or background work. */
export function withRoadmapCachePolicy(
  request: Request,
  response: Response
): Response {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const exactHost =
    ['tuturuuu.com', 'roadmap.tuturuuu.com'].includes(url.host) &&
    (host === null || host === url.host) &&
    url.protocol === 'https:';
  const vary =
    response.headers
      .get('vary')
      ?.split(',')
      .map((item) => item.trim().toLowerCase()) ?? [];
  const upstreamCache = response.headers.get('cache-control') ?? '';
  const safe =
    exactHost &&
    ['GET', 'HEAD'].includes(request.method) &&
    response.status === 200 &&
    !url.href.includes('?') &&
    !url.hash &&
    !url.username &&
    !url.password &&
    !/[%\\]/.test(url.pathname) &&
    !url.pathname.includes('//') &&
    !response.headers.has('set-cookie') &&
    vary.every((item) => item === 'accept-encoding') &&
    !/\b(?:private|no-store|no-cache)\b/i.test(upstreamCache);
  const contentType = response.headers.get('content-type') ?? '';
  const html = /^text\/html(?:;|$)/i.test(contentType);
  const document =
    (url.host === 'tuturuuu.com' && url.pathname === '/roadmap/') ||
    (url.host === 'roadmap.tuturuuu.com' && url.pathname === '/');

  // Asset caching remains the native asset supplier's responsibility.
  if (safe && !html && url.pathname.startsWith('/roadmap/assets/'))
    return response;

  const headers = new Headers(response.headers);
  headers.set(
    'cache-control',
    safe && html && document ? PUBLIC_DOCUMENT_CACHE : PRIVATE_RESPONSE_CACHE
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
