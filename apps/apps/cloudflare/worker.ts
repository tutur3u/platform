import handler from '@tanstack/react-start/server-entry';
import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { apiRequest } from '../src/native/api.server';
import {
  canonicalLocaleRedirect,
  localeCookie,
  requestLocale,
} from '../src/native/locale';
import { gatewayDestination } from '../src/native/redirect';
import {
  appendContextCookies,
  withRequestContext,
} from '../src/native/request-context';

export interface AppsEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INTERNAL_WEB_API_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
  APPS_CANONICAL_HOST_ENABLED?: string;
}
const publicPaths = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/site.webmanifest',
]);
export async function appsRequest(request: Request, env: AppsEnvironment) {
  const result = await withRequestContext(request, async () => {
    const url = new URL(request.url);
    if (
      url.hostname === 'apps.tuturuuu.com' &&
      env.APPS_CANONICAL_HOST_ENABLED !== '1'
    )
      return new Response('Staging gateway only', {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow, nosnippet',
        },
      });
    const identity = workerBuildInfo(request, 'apps');
    if (identity) return identity;
    let response: Response;
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      response = await apiRequest(
        request,
        env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com'
      );
    } else if (
      url.pathname.startsWith('/assets/') ||
      publicPaths.has(url.pathname)
    ) {
      response = await env.ASSETS.fetch(request);
    } else {
      try {
        decodeURIComponent(url.pathname);
      } catch {
        return new Response('Invalid path', { status: 400 });
      }
      if (
        !['GET', 'HEAD'].includes(request.method) &&
        !url.pathname.startsWith('/_serverFn/')
      ) {
        return new Response(null, {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }
      const canonical = canonicalLocaleRedirect(request);
      if (canonical) response = canonical;
      else {
        const destination = gatewayDestination(url);
        response =
          destination.kind === 'redirect'
            ? new Response(null, {
                status: 307,
                headers: { Location: destination.href },
              })
            : await handler.fetch(request);
      }
      response = new Response(response.body, response);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.append('Vary', 'Cookie, Authorization, Accept-Language');
      if (!canonical)
        response.headers.append(
          'Set-Cookie',
          localeCookie(request, requestLocale(request))
        );
    }
    response = appendContextCookies(response);
    if (env.TUTURUUU_NOINDEX === '1' || url.pathname !== '/')
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return request.method === 'HEAD' ? new Response(null, response) : response;
  });
  return enforceStagingCookiePolicy(request, result);
}
export default { fetch: appsRequest };
