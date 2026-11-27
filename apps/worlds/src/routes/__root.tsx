import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import type { ReactNode } from 'react';
import styles from '../worlds.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Tuturuuu Worlds' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: Outlet,
  shellComponent: RootDocument,
  notFoundComponent: WorldsNotFound,
  errorComponent: WorldsError,
});

function useWorldsLocale() {
  return useRouterState({
    select: ({ location }) => (location.search.lang === 'vi' ? 'vi' : 'en'),
  });
}

function RootDocument({ children }: { children: ReactNode }) {
  const language = useWorldsLocale();
  return (
    <html lang={language}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function WorldsNotFound() {
  return (
    <StatusPage
      variant="not-found"
      locale={useWorldsLocale()}
      appName="Worlds"
      appHref="/"
    />
  );
}

function WorldsError({ reset }: ErrorComponentProps) {
  return (
    <StatusPage
      variant="error"
      locale={useWorldsLocale()}
      appName="Worlds"
      appHref="/"
      onRetry={reset}
    />
  );
}
