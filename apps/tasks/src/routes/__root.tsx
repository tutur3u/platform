import { createRootRoute, Outlet } from '@tanstack/react-router';
import {
  appBaseHeadScript,
  withAppBase,
} from '@tuturuuu/start-bridge/start/base-path';
import { loadTasksLocale } from '../runtime/page-loader';
import { Document, TasksError } from '../runtime/router-shell';

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => ({
    locale: await loadTasksLocale({ data: { path: location.href } }),
  }),
  shellComponent: Document,
  component: Outlet,
  errorComponent: TasksError,
  head: () => ({
    scripts: [appBaseHeadScript()],
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover',
      },
      { title: 'Tuturuuu Tasks' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
    links: [
      { rel: 'icon', href: withAppBase('/favicon.ico') },
      { rel: 'apple-touch-icon', href: withAppBase('/apple-touch-icon.png') },
      { rel: 'manifest', href: withAppBase('/site.webmanifest') },
    ],
  }),
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center">
      <h1>404</h1>
    </main>
  ),
});
