import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactNode } from 'react';
import { LinkStatusPage } from '../components/link-status-page';
import '@tuturuuu/ui/globals.css';

const name = 'Tuturuuu Shortener';
const description =
  'Fast, privacy-aware link redirects powered by Tuturuuu Shortener.';
const ogImage = 'https://tuturuuu.com/media/logos/og-image.jpg';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: name },
      { name: 'description', content: description },
      { name: 'application-name', content: name },
      {
        name: 'keywords',
        content: `${name},Tuturuuu,link shortener,short URLs,link redirects,Tuturuuu links`,
      },
      { name: 'author', content: 'Tuturuuu' },
      { name: 'creator', content: 'Tuturuuu' },
      { name: 'publisher', content: 'Tuturuuu' },
      { name: 'referrer', content: 'origin-when-cross-origin' },
      { name: 'robots', content: 'noindex, nofollow' },
      {
        name: 'format-detection',
        content: 'telephone=no, address=no, email=no',
      },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: name },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:locale:alternate', content: 'vi_VN' },
      { property: 'og:title', content: name },
      { property: 'og:description', content: description },
      { property: 'og:site_name', content: name },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: name },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
      { name: 'twitter:creator', content: '@tuturuuu' },
      { name: 'twitter:site', content: '@tuturuuu' },
    ],
    links: [
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'icon', href: 'https://tuturuuu.com/favicon.ico' },
      { rel: 'shortcut icon', href: 'https://tuturuuu.com/favicon-16x16.png' },
      {
        rel: 'apple-touch-icon',
        href: 'https://tuturuuu.com/apple-touch-icon.png',
      },
    ],
  }),
  component: Outlet,
  shellComponent: Document,
  notFoundComponent: () => <LinkStatusPage kind="not-found" />,
  errorComponent: ({ error, reset }) => (
    <AppErrorBoundary
      appName="Shortener"
      error={
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'Unknown error', {
              cause: error,
            })
      }
      reset={reset}
    />
  ),
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
