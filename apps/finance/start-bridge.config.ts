/// <reference path="./cloudflare/native-profile-env.d.ts" />
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { framablePathRegexes } from '@tuturuuu/utils/framable-paths';
import { resolveFinanceNativeProfile } from './cloudflare/native-profile.ts';
import type { FinanceEnvironment } from './cloudflare/worker';
import { publicAssets } from './src/start-bridge/public-assets.bridge.gen.ts';

const framablePaths = framablePathRegexes();
const profile = resolveFinanceNativeProfile(
  import.meta.env?.VITE_FINANCE_NATIVE_PROFILE
);

export default defineBridgeAppConfig<FinanceEnvironment>({
  csp: defaultContentSecurityPolicy,
  mounts: {
    rootHosts: [profile.rootHost],
    mountHosts: [],
    unknownHost: 'reject',
  },
  wrapResponse(response, { request }) {
    const secured = new Response(response.body, response);
    secured.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    const pathname = new URL(request.url).pathname;
    if (framablePaths.some((pattern) => pattern.test(pathname))) {
      secured.headers.delete('X-Frame-Options');
    } else {
      secured.headers.set('X-Frame-Options', 'DENY');
    }
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const staticAsset =
      (request.method === 'GET' || request.method === 'HEAD') &&
      (pathname.startsWith('/assets/') || publicAssets.has(pathname)) &&
      response.status === 200 &&
      !response.headers.get('content-type')?.includes('text/html');
    if (!staticAsset) {
      secured.headers.set('Cache-Control', 'private, no-store');
      secured.headers.append('Vary', 'Cookie, Authorization, Accept-Language');
    }
    return secured;
  },
});
