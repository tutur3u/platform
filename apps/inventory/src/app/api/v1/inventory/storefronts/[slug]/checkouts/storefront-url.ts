import 'server-only';

import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context/core';

export function getStorefrontUrl(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_STOREFRONT_APP_URL ||
    process.env.STOREFRONT_APP_URL;
  if (configured) return configured;

  const context = maybeBridgeRequest();
  const url = new URL(context?.request.url ?? request.url);
  if (
    context?.appBase === '/storefront' ||
    url.hostname === 'tuturuuu.com' ||
    url.pathname === '/storefront' ||
    url.pathname.startsWith('/storefront/')
  ) {
    return `${url.origin}/storefront`;
  }

  // Storefront's API proxy keeps the shopper's Origin when forwarding to
  // Inventory. Only the canonical apex selects this mounted return target.
  if (request.headers.get('origin') === 'https://tuturuuu.com') {
    return 'https://tuturuuu.com/storefront';
  }
  if (url.hostname.includes('storefront.')) return url.origin;

  return process.env.NODE_ENV === 'production'
    ? 'https://storefront.tuturuuu.com'
    : 'http://localhost:7822';
}
