import { createBuildInfoHandler } from './build-info-route';

/** Public release identity, handled before session middleware on native Workers. */
export function workerBuildInfo(request: Request, appName: string) {
  if (new URL(request.url).pathname !== '/api/build-info') return null;
  const headers = { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers });
  const response = createBuildInfoHandler(appName)();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
