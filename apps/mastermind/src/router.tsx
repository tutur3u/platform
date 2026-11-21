import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
  queryClient: QueryClient;
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
  });
  return createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    basepath: routerBasepath(),
    // Every script the router renders carries this response's CSP nonce.
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
