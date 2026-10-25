import { createRouter } from '@tanstack/react-router';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';
import { financeApiPath } from './start-bridge/api-base';

if (typeof window !== 'undefined') {
  const unregister = registerDefaultAppBaseResolver(financeApiPath);
  import.meta.hot?.dispose(unregister);
}

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    // The response's CSP nonce when the Worker enforces `csp`; else none.
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
