import { createRouter } from '@tanstack/react-router';
import { LinkStatusPage } from './components/link-status-page';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
    defaultNotFoundComponent: () => <LinkStatusPage kind="not-found" />,
  });
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
