import { createRootRoute } from '@tanstack/react-router';
import { Document, ErrorPage } from '../runtime/router-shell';

export const Route = createRootRoute({
  errorComponent: ErrorPage,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover',
      },
      { title: 'Tuturuuu Mail' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
  component: Document,
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center">
      <h1>404</h1>
    </main>
  ),
});
