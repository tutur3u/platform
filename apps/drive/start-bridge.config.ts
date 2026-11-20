import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { createRootResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { scopeStagingCookies } from './src/start-candidate/staging-policy';

const decorate = createRootResponsePolicy({
  seo: 'noindex, nofollow, nosnippet',
});

const FINGERPRINTED_ASSET =
  /^\/assets\/.+-[\w-]{8}\.(?:css|js|mjs|woff2?|wasm|png|svg|webp)$/u;

const production = process.env.VITE_DRIVE_NATIVE_PROFILE === 'production';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: [production ? 'drive.tuturuuu.com' : 'drive.tutur3u.com'],
    mountHosts: production ? ['tuturuuu.com'] : [],
    basePath: '/drive',
    unknownHost: 'reject',
  },
  worker: { workersDev: false },
  csp: defaultContentSecurityPolicy,
  wrapResponse(response, context) {
    const secured = scopeStagingCookies(
      context.request,
      decorate(response, context)
    );
    const { request } = context;
    const url = new URL(request.url);
    const path =
      url.hostname === 'tuturuuu.com'
        ? url.pathname.slice('/drive'.length)
        : url.pathname;
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      secured.status === 200 &&
      FINGERPRINTED_ASSET.test(path) &&
      secured.headers.get('Cache-Control')?.startsWith('public,') &&
      !secured.headers.has('Set-Cookie')
    ) {
      secured.headers.set(
        'Cache-Control',
        'public, max-age=31536000, immutable'
      );
    }
    return secured;
  },
});
