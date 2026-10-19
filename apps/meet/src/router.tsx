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
import en from '../messages/en.json';
import vi from '../messages/vi.json';
import { AppProviders } from './runtime/app-providers';
import { pageHead } from './runtime/page-head';
import { loadMeetPage } from './runtime/page-loader';
import { PageView } from './runtime/page-view';
import './app/[locale]/meet.css';
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
      <body className="meet-font overflow-y-auto bg-root-background antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function Pending(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  const labels = (pathname.startsWith('/vi') ? vi : en).meet.loading;
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <section className="max-w-sm text-center">
        <img
          src="/media/branding/brand-mark-light.svg"
          width="2369"
          height="512"
          alt="Tuturuuu"
          className="mb-9 h-auto w-full dark:hidden"
        />
        <img
          src="/media/branding/brand-mark-dark.svg"
          width="2369"
          height="512"
          alt="Tuturuuu"
          className="mb-9 hidden h-auto w-full dark:block"
        />
        <h1 className="font-medium text-4xl">{labels.title}</h1>
        <p className="mt-4 text-muted-foreground">{labels.hint}</p>
        <p role="status" className="mt-8 text-sm">
          {labels.status}
        </p>
      </section>
    </main>
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
      <AppErrorBoundary
        appName="Meet"
        error={
          error instanceof Error
            ? error
            : new Error(String(error), { cause: error })
        }
        reset={reset}
      />
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
      { title: 'Tuturuuu Meet' },
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
  loader: ({ location }) => loadMeetPage({ data: { path: location.href } }),
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData) : {}),
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
  pendingComponent: Pending,
});

const page = createRoute({
  getParentRoute: () => root,
  path: '$',
  loader: ({ location }) => loadMeetPage({ data: { path: location.href } }),
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData) : {}),
  component: function MeetPage(): ReactElement {
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
  pendingComponent: Pending,
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
