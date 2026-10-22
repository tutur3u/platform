import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ request }) =>
        request.method !== 'GET' && request.method !== 'HEAD',
    }),
  ],
}));
