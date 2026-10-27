import { type Fetcher, proxyNext } from './fallback';
import {
  admittedOrigin,
  stagingProfile,
  type WebCandidateEnv,
} from './profile';

export function createWebCandidateHandler({
  start,
  fetcher = fetch,
}: {
  start: (request: Request) => Response | Promise<Response>;
  fetcher?: Fetcher;
}) {
  return async (request: Request, env: WebCandidateEnv) => {
    const origin = admittedOrigin(request, env);
    let response: Response;
    if (!origin || !env.TRUSTED_PROXY_ORIGIN_SECRET) {
      response = new Response('Web candidate disabled', { status: 503 });
    } else {
      try {
        response =
          new URL(request.url).pathname === '/__web1' &&
          ['GET', 'HEAD'].includes(request.method)
            ? await start(request)
            : await proxyNext(
                request,
                origin,
                env.TRUSTED_PROXY_ORIGIN_SECRET,
                fetcher
              );
      } catch {
        response = new Response('Next fallback unavailable', { status: 502 });
      }
    }
    const headers = new Headers(response.headers);
    headers.set('strict-transport-security', stagingProfile.hsts);
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('cdn-cache-control', 'no-store');
    if (headers.has('set-cookie') || response.status >= 500)
      headers.set('cache-control', 'no-store');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
