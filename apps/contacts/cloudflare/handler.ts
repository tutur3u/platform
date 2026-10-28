import { type Fetcher, proxyNext } from './fallback';
import {
  admittedOrigin,
  type ContactsCandidateEnv,
  stagingProfile,
} from './profile';

export function createContactsCandidateHandler({
  start,
  fetcher = fetch,
}: {
  start: (request: Request) => Response | Promise<Response>;
  fetcher?: Fetcher;
}) {
  return async (request: Request, env: ContactsCandidateEnv) => {
    const origin = admittedOrigin(request, env);
    const nativeProbe =
      new URL(request.url).pathname === '/__contacts1' &&
      ['GET', 'HEAD'].includes(request.method);
    let response: Response;
    if (!origin || !env.TRUSTED_PROXY_ORIGIN_SECRET) {
      response = new Response('Contacts candidate disabled', { status: 503 });
    } else {
      try {
        response = nativeProbe
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
    if (origin)
      headers.set(
        'x-tuturuuu-contacts-renderer',
        nativeProbe ? 'native-Start' : 'Next-fallback'
      );
    if (headers.has('set-cookie') || response.status >= 500)
      headers.set('cache-control', 'no-store');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
