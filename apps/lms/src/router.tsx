import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { createRouter } from '@tanstack/react-router';
import { LMS_BASE } from '../cloudflare/routing';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    ssr: { nonce: requestNonce() },
    basepath: LMS_BASE,
    // The shell has no search schema. Pass the incoming search through Start's
    // canonicalization without normalizing or grouping any parameters.
    parseSearch: (search) => ({ rawSearch: search }),
    stringifySearch: ({ rawSearch }) =>
      typeof rawSearch === 'string' ? rawSearch : '',
    scrollRestoration: true,
    defaultPreload: false,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
