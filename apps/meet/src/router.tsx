import { createRouter } from '@tanstack/react-router';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { appPath } from '@tuturuuu/start-bridge/app-url';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';

registerDefaultAppBaseResolver(
  (path) =>
    /^\/api\/(?:meet-(?:ai|call|live)\/|build-info(?:[?#]|$))/u.test(path)
      ? appPath(path)
      : path,
  { app: 'meet' }
);

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    ssr: { nonce: globalThis.__meetCspNonce?.() },
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
