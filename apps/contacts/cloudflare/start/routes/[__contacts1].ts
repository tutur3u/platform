import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/__contacts1')({
  server: {
    handlers: {
      HEAD: () =>
        new Response(null, { headers: { 'content-type': 'application/json' } }),
      GET: () =>
        Response.json({
          app: 'contacts',
          status: 'candidate',
          pages: 'Next-fallback',
        }),
    },
  },
});
