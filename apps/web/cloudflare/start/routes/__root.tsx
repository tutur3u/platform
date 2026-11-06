import {
  createRootRoute,
  HeadContent,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import css from '../legal.css?raw';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: Outlet,
  shellComponent: Document,
});

function Document({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <html lang={pathname.startsWith('/vi/') ? 'vi' : 'en'}>
      <head>
        <HeadContent />
        <style>{css}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
