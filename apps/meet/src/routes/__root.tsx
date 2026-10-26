import { createRootRoute } from '@tanstack/react-router';
import { appPath } from '@tuturuuu/start-bridge/app-url';
import { appBaseHeadScript } from '@tuturuuu/start-bridge/start/base-path';
import { Document, ErrorPage, NotFoundPage } from '../runtime/router-shell';

export const Route = createRootRoute({
  errorComponent: ErrorPage,
  head: () => ({
    scripts: [appBaseHeadScript()],
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
    links: [{ rel: 'icon', href: appPath('/favicon.ico') }],
  }),
  component: Document,
  notFoundComponent: NotFoundPage,
});
