import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { bridgeServerFnFetch } from '@tuturuuu/start-bridge/start/base-path';

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  serverFns: { fetch: bridgeServerFnFetch },
  requestMiddleware: [csrfMiddleware],
}));
