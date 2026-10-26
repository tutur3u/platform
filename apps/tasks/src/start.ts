import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { bridgeServerFnFetch } from '@tuturuuu/start-bridge/start/base-path';

export const startInstance = createStart(() => ({
  serverFns: { fetch: bridgeServerFnFetch },
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ request }) =>
        request.method !== 'GET' && request.method !== 'HEAD',
    }),
  ],
}));
