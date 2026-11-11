import { createRouter } from '@tanstack/react-router';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';
import { registerCalendarBrowserApiPaths } from './runtime/calendar-api-client';
import { canonicalCalendarAddress } from './runtime/one-origin-address';
import { CalendarError } from './runtime/router-shell';
import '@tuturuuu/tasks-ui/globals.css';
import './runtime/typography.css';

let browserApiRoutingInstalled = false;
export function getRouter() {
  if (typeof window !== 'undefined' && !browserApiRoutingInstalled) {
    registerCalendarBrowserApiPaths();
    browserApiRoutingInstalled = true;
  }
  const router = createRouter({
    routeTree: routeTree,
    basepath: routerBasepath(),
    ssr: { nonce: requestNonce() },
    defaultErrorComponent: CalendarError,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultStaleTime: 0,
  });
  if (typeof window !== 'undefined' && routerBasepath() === '/calendar') {
    const keepCanonical = () => {
      const target = canonicalCalendarAddress(window.location);
      if (target) window.history.replaceState(window.history.state, '', target);
    };
    router.subscribe('onResolved', keepCanonical);
    router.subscribe('onRendered', keepCanonical);
  }
  return router;
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
