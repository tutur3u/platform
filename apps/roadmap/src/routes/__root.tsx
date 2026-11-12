import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import type { ReactNode } from 'react';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { langFromPathname } from '../seo';
import styles from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'theme-color',
        content: '#0a0a0a',
        media: '(prefers-color-scheme: dark)',
      },
      {
        name: 'theme-color',
        content: '#fdf9f7',
        media: '(prefers-color-scheme: light)',
      },
      // Title, description, og:title/url, canonical and hreflang are per
      // page: each route sets its own, so no page claims another's URL.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Tuturuuu' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', type: 'image/png', href: logo },
      { rel: 'apple-touch-icon', href: logo },
    ],
  }),
  component: Outlet,
  shellComponent: Document,
  notFoundComponent: () => (
    <main>
      <h1>Page not found</h1>
      <a href="/roadmap">Return to the roadmap</a>
    </main>
  ),
});

function Document({ children }: { children: ReactNode }) {
  // Each language has its own URL, so the document language follows it.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <html lang={langFromPathname(pathname)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PublicSatelliteProviders>{children}</PublicSatelliteProviders>
        <Scripts />
      </body>
    </html>
  );
}
