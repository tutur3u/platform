import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { createBridgeStatusComponents } from '@tuturuuu/start-bridge/start/status-route';
import { appBaseHeadScript } from '@tuturuuu/start-bridge/start/base-path';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import type { RouterContext } from '../router';
import styles from '../styles.css?url';

const { BridgeNotFound, BridgeError } = createBridgeStatusComponents({
  appName: 'Mastermind',
});

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    scripts: [appBaseHeadScript()],
    meta: [
      { charSet: 'utf-8' },
      { title: 'Mastermind' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'color-scheme', content: 'dark light' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: Root,
  shellComponent: Document,
  notFoundComponent: BridgeNotFound,
  errorComponent: BridgeError,
});

function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function Document({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lang = /^\/vi(\/|$)/.test(pathname) ? 'vi' : 'en';
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-root-background text-foreground antialiased">
        {/* next-themes' pre-paint script carries the CSP nonce too. */}
        <ThemeProvider
          attribute="class"
          enableSystem
          defaultTheme="system"
          nonce={requestNonce()}
        >
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
