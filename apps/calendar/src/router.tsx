import {
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactElement, ReactNode } from 'react';
import { AppProviders } from './runtime/app-providers';
import { loadCalendarLocale, loadCalendarPage } from './runtime/page-loader';
import { PageView } from './runtime/page-view';
import '@tuturuuu/tasks-ui/globals.css';
import './runtime/typography.css';

function useResolvedLocale(): 'en' | 'vi' {
  return (
    useRouteContext({
      from: '__root__',
      select: (context) => context.locale,
    }) ?? 'en'
  );
}

function Document({ children }: { children: ReactNode }): ReactElement {
  const locale = useResolvedLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="calendar-font overflow-y-auto bg-root-background antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function CalendarError({ error, reset }: ErrorComponentProps): ReactElement {
  const locale = useResolvedLocale();
  return (
    <AppProviders locale={locale} params={{}} showVersionBadge={false}>
      <AppErrorBoundary
        appName="Calendar"
        locale={locale}
        error={
          error instanceof Error
            ? error
            : new Error('Calendar page failed', { cause: error })
        }
        reset={reset}
      />
    </AppProviders>
  );
}
const root = createRootRoute({
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
const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  loader: ({ location }) => loadCalendarPage({ data: { path: location.href } }),
  component: function Index() {
    const model = index.useLoaderData();
    return (
      <AppProviders
        locale={model.locale}
        actorId={model.actorId}
        showVersionBadge={model.showVersionBadge}
        params={model.params}
      >
        <PageView model={model} />
      </AppProviders>
    );
  },
});
const page = createRoute({
  getParentRoute: () => root,
  path: '$',
  loader: ({ location }) => loadCalendarPage({ data: { path: location.href } }),
  component: function CalendarPage() {
    const model = page.useLoaderData();
    return (
      <AppProviders
        locale={model.locale}
        actorId={model.actorId}
        showVersionBadge={model.showVersionBadge}
        params={model.params}
      >
        <PageView model={model} />
      </AppProviders>
    );
  },
});
export function getRouter() {
  return createRouter({
    routeTree: root.addChildren([index, page]),
    defaultErrorComponent: CalendarError,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultStaleTime: 0,
  });
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
