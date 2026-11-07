import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import styles from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Roadmap · Tuturuuu' },
      { name: 'description', content: 'Follow Tuturuuu’s migration to Cloudflare. Public milestones, current work and the evidence behind each update.' },
    ],
    links: [{ rel: 'stylesheet', href: styles }, { rel: 'canonical', href: 'https://tuturuuu.com/roadmap/' }],
  }),
  component: Outlet,
  shellComponent: Document,
  notFoundComponent: () => <main><h1>Page not found</h1><a href="/roadmap">Return to the roadmap</a></main>,
});

function Document({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}
