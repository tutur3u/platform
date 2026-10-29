// App-owned start-bridge Worker options for ai: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  worker: { compatibilityFlags: ['enable_request_signal'] },
  mounts: {
    rootHosts: ['ai.tuturuuu.com', 'ai.staging.tutur3u.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  wrapResponse(response, { request }) {
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    const path = new URL(request.url).pathname;
    const sandboxedWebgl =
      /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[^/]+\/webgl(?:\/|$)/u.test(
        path
      );
    if (sandboxedWebgl) {
      result.headers.delete('X-Frame-Options');
    } else {
      const csp = result.headers.get('Content-Security-Policy');
      const directives =
        csp
          ?.split(';')
          .map((directive) => directive.trim())
          .filter(
            (directive) =>
              directive.trim() &&
              !/^frame-ancestors(?:\s|$)/iu.test(directive.trim())
          ) ?? [];
      result.headers.set(
        'Content-Security-Policy',
        [...directives, "frame-ancestors 'none'"].join('; ')
      );
      result.headers.set('X-Frame-Options', 'DENY');
    }
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const isAsset =
      (request.method === 'GET' || request.method === 'HEAD') &&
      (path.startsWith('/assets/') || path === '/robots.txt');
    if (!isAsset) {
      result.headers.set('Cache-Control', 'private, no-store');
      const vary = result.headers.get('Vary');
      if (
        !vary
          ?.split(',')
          .some((value) => value.trim().toLowerCase() === 'cookie')
      ) {
        result.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
      }
    }
    return result;
  },
});
