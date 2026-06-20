import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  LegacyErrorShell,
  LegacyNotFoundShell,
} from '../components/route-shell';
import { createPageHead } from '../lib/platform/head';
import { defaultLocale } from '../lib/platform/locale';
import { createThemeInitScript } from '../lib/platform/theme';
import type { RouterContext } from '../router';
import appCss from '../styles/app.css?url';

const themeInitScript = createThemeInitScript();

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: LegacyErrorShell,
  head: () =>
    createPageHead(
      {
        description:
          'Migration dashboard for the Tuturuuu TanStack Start and Rust backend cutover.',
        locale: defaultLocale,
        robots: 'noindex,nofollow',
        title: 'Tuturuuu TanStack Migration',
      },
      {
        stylesheets: [appCss],
      }
    ),
  notFoundComponent: LegacyNotFoundShell,
  shellComponent: RootDocument,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        <script data-cfasync="false">{themeInitScript}</script>
        <HeadContent />
      </head>
      <body className="overflow-y-auto bg-root-background antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
