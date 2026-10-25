import { createRouter } from '@tanstack/react-router';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';
import { CalendarError } from './runtime/router-shell';
import '@tuturuuu/tasks-ui/globals.css';
import './runtime/typography.css';
export function getRouter() {
  return createRouter({
    routeTree: routeTree,
    basepath: routerBasepath(),
    defaultErrorComponent: CalendarError,
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
