export const PUBLIC_DOCUMENT_CACHE =
  'public,s-maxage=300,stale-while-revalidate=86400';
export const PRIVATE_RESPONSE_CACHE = 'private,no-store';
export const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable';

/** Vite content hashes look like `index-CGgt8iCG.js`. */
export function isHashedAssetPath(pathname: string): boolean {
  return /^\/roadmap\/assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(
    pathname
  );
}

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
    vary.every((item) => item === 'accept-encoding');
  const contentType = response.headers.get('content-type') ?? '';
  const html = /^text\/html(?:;|$)/i.test(contentType);
  const document =
    (url.host === 'tuturuuu.com' && url.pathname === '/roadmap/') ||
    (url.host === 'roadmap.tuturuuu.com' && url.pathname === '/');

  if (safe && isHashedAssetPath(url.pathname)) {
    if (response.headers.get('cache-control') === IMMUTABLE_ASSET_CACHE)
      return response;
    const headers = new Headers(response.headers);
    headers.set('cache-control', IMMUTABLE_ASSET_CACHE);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // Unhashed files keep the supplier policy. They are not immutable.
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
