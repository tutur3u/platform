// App-owned start-bridge Worker options for ai: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['ai.tuturuuu.com', 'ai-staging.tuturuuu.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  wrapResponse(response, { request }) {
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    result.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const path = new URL(request.url).pathname;
    const isAsset = path.startsWith('/assets/') || path === '/robots.txt';
    if (!isAsset) {
      if (!result.headers.has('Cache-Control')) {
        result.headers.set('Cache-Control', 'private, no-store');
      }
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
