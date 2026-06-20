import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  notFound,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';
import {
  LegacyErrorShell,
  LegacyNotFoundShell,
} from '../components/route-shell';
import {
  createLegacyRootLayoutHead,
  findUnsupportedLocaleRouteMatch,
  getAppShellDocumentLocale,
  getAppShellDocumentLocaleFromMatches,
  hasLocalizedRouteMatch,
} from '../lib/platform/app-shell';
import { createPageHead } from '../lib/platform/head';
import { defaultLocale } from '../lib/platform/locale';
import { createThemeInitScript } from '../lib/platform/theme';
import type { RouterContext } from '../router';
import appCss from '../styles/app.css?url';

const themeInitScript = createThemeInitScript();

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ matches }) => {
    const unsupportedLocaleRouteMatch =
      findUnsupportedLocaleRouteMatch(matches);

    if (unsupportedLocaleRouteMatch) {
      throw notFound({
        data: unsupportedLocaleRouteMatch,
      });
    }
  },
  component: RootComponent,
  errorComponent: LegacyErrorShell,
  head: ({ matches }) => {
    if (hasLocalizedRouteMatch(matches)) {
      return createLegacyRootLayoutHead(
        getAppShellDocumentLocaleFromMatches(matches),
        { stylesheets: [appCss] }
      );
    }

    return createPageHead(
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
    );
  },
  notFoundComponent: LegacyNotFoundShell,
  shellComponent: RootDocument,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const locale = getAppShellDocumentLocale(pathname);

  return (
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
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
