import { createRouter } from '@tanstack/react-router';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { routerBasepath } from '@tuturuuu/start-bridge/start/base-path';
import { routeTree } from './routeTree.gen';
import './runtime/app-base';
import { TasksError } from './runtime/router-shell';
import '@tuturuuu/tasks-ui/globals.css';
import './style/prosemirror.css';
import './runtime/typography.css';

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: routerBasepath(),
    // The response's CSP nonce when the Worker enforces `csp`; else none.
    ssr: { nonce: requestNonce() },
    defaultErrorComponent: TasksError,
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
