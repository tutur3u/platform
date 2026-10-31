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
    rootHosts: ['store.tuturuuu.com', 'storefront.staging.tutur3u.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  wrapResponse(response, { request }) {
    const url = new URL(request.url);
    const redirects = new Set([
      'storefront.tuturuuu.com',
      'stores.tuturuuu.com',
      'storefronts.tuturuuu.com',
    ]);
    const destination = new URL('https://store.tuturuuu.com');
    destination.pathname = url.pathname;
    destination.search = url.search;
    const result = redirects.has(url.hostname)
      ? new Response(null, {
          status: 307,
          headers: { Location: destination.href },
        })
      : new Response(response.body, response);
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
