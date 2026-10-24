import { createRootRoute } from '@tanstack/react-router';
import { Document, ErrorPage, NotFoundPage } from '../runtime/router-shell';

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
      { title: 'Tuturuuu Meet' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
  component: Document,
  notFoundComponent: NotFoundPage,
});
