import { createRouter } from '@tanstack/react-router';
import { LMS_BASE } from '../cloudflare/routing';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: LMS_BASE,
    scrollRestoration: true,
    defaultPreload: false,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
