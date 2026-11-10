import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import type { ReactNode } from 'react';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import historyUrl from '../generated/history.json?url';
import styles from '../styles.css?url';

/** Canonical: no trailing slash, like every Tuturuuu URL. */
const ROADMAP_URL = 'https://tuturuuu.com/roadmap';

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
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Tuturuuu' },
      { property: 'og:title', content: 'Roadmap · Tuturuuu' },
      { property: 'og:url', content: ROADMAP_URL },
      {
        name: 'description',
        content:
          'What Tuturuuu is building: every product track, milestone and deliverable, with what shipped this week, live from public pull requests and deploy checks.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', type: 'image/png', href: logo },
      // Full history for the timeline: hashed, immutable, fetched at idle.
      { rel: 'prefetch', href: historyUrl, as: 'fetch' },
      { rel: 'apple-touch-icon', href: logo },
      { rel: 'canonical', href: ROADMAP_URL },
      // One URL serves both languages (the EN/VI switch is client-side).
      { rel: 'alternate', hrefLang: 'en', href: ROADMAP_URL },
      { rel: 'alternate', hrefLang: 'vi', href: ROADMAP_URL },
      { rel: 'alternate', hrefLang: 'x-default', href: ROADMAP_URL },
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
