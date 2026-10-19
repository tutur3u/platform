import {
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
  useMatches,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactElement } from 'react';
import { mailPageHead } from './runtime/page-head';
import { loadMailPage } from './runtime/page-loader';
import { PageView } from './runtime/page-view';
import { AppProviders } from './runtime/providers';
import '@tuturuuu/ui/globals.css';
import './runtime/typography.css';

function Document(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  const model = useMatches({ select: (matches) => matches.at(-1)?.loaderData });
  const locale =
    model && typeof model === 'object' && 'locale' in model
      ? model.locale
      : pathname.startsWith('/vi')
        ? 'vi'
        : 'en';
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="mail-font overflow-hidden bg-root-background antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function ErrorPage({ error, reset }: ErrorComponentProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <AppProviders
      locale={pathname.startsWith('/vi') ? 'vi' : 'en'}
      showVersionBadge={false}
      params={{}}
    >
      <AppErrorBoundary appName="Mail" error={error} reset={reset} />
    </AppProviders>
  );
}

const root = createRootRoute({
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

const index = createRoute({
  getParentRoute: () => root,
  path: '/',
  loader: ({ location }) => loadMailPage({ data: { path: location.href } }),
  head: ({ loaderData }) => (loaderData ? mailPageHead(loaderData) : {}),
  component: function IndexPage(): ReactElement {
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
  loader: ({ location }) => loadMailPage({ data: { path: location.href } }),
  head: ({ loaderData }) => (loaderData ? mailPageHead(loaderData) : {}),
  component: function MailPage(): ReactElement {
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
