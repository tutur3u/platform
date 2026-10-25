import {
  type BridgeAppConfig,
  defineBridgeAppConfig,
} from '@tuturuuu/start-bridge/start/app-config';

type StorefrontApiEnvironment = {
  INTERNAL_WEB_API_ORIGIN?: string;
  INVENTORY_APP_URL?: string;
  NEXT_PUBLIC_INVENTORY_APP_URL?: string;
};

type ApiOrigin = NonNullable<
  BridgeAppConfig<StorefrontApiEnvironment>['apiOrigin']
>;

export const selectStorefrontApiOrigin: ApiOrigin = (
  _request,
  { env, path }
) => {
  if (!path.startsWith('/api/v1/inventory/')) return undefined;
  const origin = env.INVENTORY_APP_URL ?? env.NEXT_PUBLIC_INVENTORY_APP_URL;
  if (!origin) throw new Error('Storefront requires INVENTORY_APP_URL');
  return origin;
};

export default defineBridgeAppConfig<StorefrontApiEnvironment>({
  apiOrigin: selectStorefrontApiOrigin,
  mounts: {
    rootHosts: ['storefront.tuturuuu.com', 'storefront-staging.tuturuuu.com'],
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
