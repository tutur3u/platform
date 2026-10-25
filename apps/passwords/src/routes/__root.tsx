import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useParams,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import '@tuturuuu/ui/globals.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Tuturuuu Passwords' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
  component: Outlet,
  shellComponent: Document,
});

function Document({ children }: { children: ReactNode }) {
  const { locale } = useParams({ strict: false });
  return (
    <html lang={locale === 'vi' ? 'vi' : 'en'}>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
