import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { bridgeServerFnFetch } from '@tuturuuu/start-bridge/start/base-path';

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
  ],
  serverFns: { fetch: bridgeServerFnFetch },
}));
