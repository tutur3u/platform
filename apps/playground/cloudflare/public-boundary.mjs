const demos = new Set([
  'tasks',
  'calendar',
  'track',
  'finance',
  'mail',
  'mind',
]);
const hosts = new Set(['playground.tuturuuu.com', 'playground.tutur3u.com']);
const noStore = { 'Cache-Control': 'private, no-store' };

export function publicBoundary(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  let relative;
  if (url.hostname === 'tuturuuu.com') {
    if (path === '/playground') relative = '/';
    else if (path.startsWith('/playground/')) relative = path.slice(11);
  } else if (hosts.has(url.hostname)) {
    relative = path;
  }
  if (!relative || path.startsWith('//') || path.split('/')[1]?.includes('%')) {
    return new Response('Not found', { status: 404, headers: noStore });
  }
  if (relative === '/api/build-info') {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, {
        status: 405,
        headers: { ...noStore, Allow: 'GET, HEAD' },
      });
    }
    if (!/^[a-f0-9]{40}$/.test(env.PLATFORM_BUILD_COMMIT_HASH ?? '')) {
      return new Response(null, { status: 503, headers: noStore });
    }
    return new Response(
      request.method === 'HEAD'
        ? null
        : JSON.stringify({
            commit: env.PLATFORM_BUILD_COMMIT_HASH,
            platform: 'cloudflare',
          }),
      {
        headers: {
          ...noStore,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }
  if (path.endsWith('/') && path !== '/') {
    const canonical = relative.slice(0, -1);
    const canonicalDemo = canonical.match(/^\/demo\/([a-z]+)$/)?.[1];
    if (relative === '/' || (canonicalDemo && demos.has(canonicalDemo))) {
      return new Response(null, {
        status: 301,
        headers: {
          ...noStore,
          Location: url.origin + path.slice(0, -1) + url.search,
        },
      });
    }
  }
  const demo = relative.match(/^\/demo\/([a-z]+)$/)?.[1];
  const page = relative === '/' || (demo && demos.has(demo));
  const asset =
    relative.startsWith('/assets/') ||
    relative === '/favicon.ico' ||
    relative === '/robots.txt';
  if (!page && !asset)
    return new Response('Not found', { status: 404, headers: noStore });
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, {
      status: 405,
      headers: { ...noStore, Allow: 'GET, HEAD' },
    });
  }
  return null;
}
