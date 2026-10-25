import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

// Same-origin enforcement for every server function, including reveal.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
