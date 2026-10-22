import { createRootRoute, Outlet } from '@tanstack/react-router';
import { loadCalendarLocale } from '../runtime/page-loader';
import { CalendarError, Document } from '../runtime/router-shell';
export const Route = createRootRoute({
  beforeLoad: async ({ location }) => ({
    locale: await loadCalendarLocale({ data: { path: location.href } }),
  }),
  shellComponent: Document,
  component: Outlet,
  errorComponent: CalendarError,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover',
      },
      { title: 'Tuturuuu Calendar' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center">
      <h1>404</h1>
    </main>
  ),
});
