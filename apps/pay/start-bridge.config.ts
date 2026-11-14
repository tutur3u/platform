import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { framablePathRegexes } from '@tuturuuu/utils/framable-paths';
import type { PayEnvironment } from './cloudflare/worker';
import { payNativeMounts } from './cloudflare/native-profile';
const rootHost = import.meta.env?.VITE_PAY_NATIVE_ROOT_HOST;

declare global {
  interface ImportMetaEnv {
    readonly VITE_PAY_NATIVE_ROOT_HOST?: string;
  }
}

const framablePaths = framablePathRegexes();

export default defineBridgeAppConfig<PayEnvironment>({
  csp: defaultContentSecurityPolicy,
  mounts: payNativeMounts(rootHost),
  wrapResponse(response, { request }) {
    const url = new URL(request.url);
    const canonicalRoot =
      rootHost === 'pay.tuturuuu.com' &&
      url.hostname === 'tuturuuu.com' &&
      url.pathname === '/pay/' &&
      (request.method === 'GET' || request.method === 'HEAD');
    const secured = canonicalRoot
      ? new Response(null, {
          status: 301,
          headers: { Location: `https://tuturuuu.com/pay${url.search}` },
        })
      : new Response(response.body, response);
    secured.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    const pathname = url.pathname;
    const appPath =
      url.hostname === 'tuturuuu.com' && pathname.startsWith('/pay/')
        ? pathname.slice('/pay'.length)
        : pathname;
    if (framablePaths.some((pattern) => pattern.test(appPath))) {
      secured.headers.delete('X-Frame-Options');
    } else {
      secured.headers.set('X-Frame-Options', 'DENY');
    }
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const publicRead = request.method === 'GET' || request.method === 'HEAD';
    const asset = appPath.startsWith('/assets/');
    if (
      !(
        publicRead &&
        asset &&
        response.status === 200 &&
        !response.headers.get('content-type')?.includes('text/html')
      )
    ) {
      secured.headers.set('Cache-Control', 'private, no-store');
      secured.headers.append('Vary', 'Cookie, Authorization, Accept-Language');
    }
    return secured;
  },
});
