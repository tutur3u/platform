import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { createBridgeStatusComponents } from '@tuturuuu/start-bridge/start/status-route';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { loadLocale } from '../locale';
import './styles.css';

const { BridgeNotFound, BridgeError } = createBridgeStatusComponents({
  appName: 'LMS',
});

export const Route = createRootRoute({
  notFoundComponent: BridgeNotFound,
  errorComponent: BridgeError,
  loader: () => loadLocale(),
  head: ({ loaderData }) => {
    const copy = loaderData === 'vi' ? vi : en;
    return {
      scripts: [
        {
          children:
            "document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)",
        },
      ],
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: copy.title },
        { name: 'description', content: copy.description },
      ],
    };
  },
  shellComponent: Document,
});

function Document({ children }: { children: ReactNode }) {
  const locale = Route.useLoaderData();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
