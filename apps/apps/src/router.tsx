import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { createRouter } from '@tanstack/react-router';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { Missing } from './routes/__root';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    ssr: { nonce: requestNonce() },
    basepath: routerBasepath(),
    scrollRestoration: true,
    defaultPreload: false,
    defaultNotFoundComponent: Missing,
  });
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
