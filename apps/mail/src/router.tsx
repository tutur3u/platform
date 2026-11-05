import { createRouter } from '@tanstack/react-router';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';
import { registerMailBrowserApiPaths } from './runtime/mail-api-client';

let browserApiRoutingInstalled = false;
export function getRouter() {
  if (typeof window !== 'undefined' && !browserApiRoutingInstalled) {
    registerMailBrowserApiPaths();
    browserApiRoutingInstalled = true;
  }
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    ssr: { nonce: requestNonce() },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultStaleTime: 0,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
