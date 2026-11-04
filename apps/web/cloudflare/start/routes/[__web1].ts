import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/__web1')({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          app: 'web',
          status: 'candidate',
          pages: 'not-migrated',
        }),
    },
  },
});
