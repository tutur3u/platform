import { createRouter } from '@tanstack/react-router';
import {
  requestNonce,
  routerBasepath,
} from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    ssr: { nonce: requestNonce() },
    scrollRestoration: true,
    defaultPreload: false,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
