import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import type { ReactNode } from 'react';
import logo from '../assets/tuturuuu-logo.png?no-inline';
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
      { title: 'Roadmap · Tuturuuu' },
      {
        name: 'description',
        content:
          'What Tuturuuu is building: every product track, milestone and deliverable, with what shipped this week, live from public pull requests and deploy checks.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', type: 'image/png', href: logo },
      { rel: 'apple-touch-icon', href: logo },
      { rel: 'canonical', href: 'https://tuturuuu.com/roadmap/' },
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
  return (
    <html lang="en" suppressHydrationWarning>
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
