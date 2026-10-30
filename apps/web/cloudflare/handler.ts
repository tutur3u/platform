import { verifyCloudflareAccessRequest } from '@tuturuuu/utils/cloudflare-access';
import { type Fetcher, proxyNext } from './fallback';
import { shouldRenderNativeLegal } from './native-legal';
import { shouldRenderNativeSecurity } from './native-security';
import { answerPreflight } from './preflight';
import {
  admittedOrigin,
  stagingProfile,
  type WebCandidateEnv,
} from './profile';

export type AccessVerifier = (
  request: Request,
  config: { teamDomain?: string; audience?: string }
) => Promise<boolean>;

export function createWebCandidateHandler({
  start,
  fetcher = fetch,
  verifyAccess = verifyCloudflareAccessRequest,
}: {
  start: (request: Request) => Response | Promise<Response>;
  fetcher?: Fetcher;
  verifyAccess?: AccessVerifier;
}) {
  return async (request: Request, env: WebCandidateEnv) => {
    const origin = admittedOrigin(request, env);
    const nativeProbe =
      new URL(request.url).pathname === '/__web1' &&
      ['GET', 'HEAD'].includes(request.method);
    const nativeLegal = shouldRenderNativeLegal(
      request,
      env.WEB_START_NATIVE_LEGAL
    );
    const nativeSecurity = shouldRenderNativeSecurity(
      request,
      env.WEB_START_NATIVE_SECURITY
    );
    const nativeDocument = nativeLegal || nativeSecurity;
    let response: Response;
    if (request.method === 'OPTIONS') {
      response = answerPreflight(request);
    } else if (
      !origin ||
      !env.TRUSTED_PROXY_ORIGIN_SECRET ||
      !env.VERCEL_AUTOMATION_BYPASS_SECRET
    ) {
      response = new Response('Web candidate disabled', { status: 503 });
    } else if (
      // Defense in depth behind Access: a gap in the Access app (path, policy
      // or bypass) must not expose the issuer. Fails closed before any work.
      !(await verifyAccess(request, {
        teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
        audience: env.CF_ACCESS_AUD,
      }).catch(() => false))
    ) {
      response = new Response('Forbidden', { status: 403 });
    } else {
      try {
        response =
          nativeProbe || nativeDocument
            ? await start(request)
            : await proxyNext(
                request,
                origin,
                env.TRUSTED_PROXY_ORIGIN_SECRET,
                env.VERCEL_AUTOMATION_BYPASS_SECRET,
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
    if (origin) {
      headers.set(
        'x-tuturuuu-web-renderer',
        nativeProbe || nativeDocument ? 'native-Start' : 'Next-fallback'
      );
    }
    if (nativeDocument && origin) {
      headers.set('cache-control', 'no-store');
      headers.set(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
      );
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    }
    if (
      headers.has('set-cookie') ||
      response.status >= 500 ||
      response.status === 403
    )
      headers.set('cache-control', 'no-store');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
