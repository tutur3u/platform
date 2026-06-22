import { createRouter } from '@tanstack/react-router';
import { createMigrationQueryClient } from './lib/platform/query';
import { routeTree } from './routeTree.gen';

export type RouterContext = {
  queryClient: ReturnType<typeof createMigrationQueryClient>;
};

export function getRouter() {
  const queryClient = createMigrationQueryClient();

  return createRouter({
    context: {
      queryClient,
    },
    defaultPreload: 'intent',
    routeTree,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
