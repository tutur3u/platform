import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { loadGateway } from '../native/page-data';
import { GatewayProviders } from '../native/providers';
import '@tuturuuu/ui/globals.css';
import '../native/styles.css';

export const Route = createRootRoute({
  loader: () => loadGateway(),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const copy = (locale === 'vi' ? vi : en).appsGateway.metadata;
    const canonical = 'https://apps.tuturuuu.com/';
    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover',
        },
        {
          name: 'theme-color',
          content: '#ffffff',
          media: '(prefers-color-scheme: light)',
        },
        {
          name: 'theme-color',
          content: '#000000',
          media: '(prefers-color-scheme: dark)',
        },
        { title: copy.title },
        { name: 'description', content: copy.description },
        { property: 'og:title', content: copy.title },
        { property: 'og:description', content: copy.description },
        { property: 'og:site_name', content: 'Tuturuuu Apps' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonical },
        { property: 'og:locale', content: locale === 'vi' ? 'vi_VN' : 'en_US' },
        {
          property: 'og:image',
          content: 'https://tuturuuu.com/media/logos/og-image.jpg',
        },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: copy.title },
        { name: 'twitter:description', content: copy.description },
        { name: 'robots', content: 'index, follow' },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'application-name', content: 'Tuturuuu Apps' },
        {
          name: 'keywords',
          content:
            'Tuturuuu Apps,Tuturuuu,workspace apps,productivity platform,business applications',
        },
        { name: 'author', content: 'Tuturuuu' },
        { name: 'creator', content: 'Tuturuuu' },
        { name: 'publisher', content: 'Tuturuuu' },
        {
          name: 'format-detection',
          content: 'telephone=no,email=no,address=no',
        },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Tuturuuu Apps' },
        {
          property: 'og:locale:alternate',
          content: locale === 'vi' ? 'en_US' : 'vi_VN',
        },
        {
          name: 'twitter:image',
          content: 'https://tuturuuu.com/media/logos/og-image.jpg',
        },
        { name: 'twitter:creator', content: '@tuturuuu' },
        { name: 'twitter:site', content: '@tuturuuu' },
      ],
      links: [
        { rel: 'canonical', href: canonical },
        { rel: 'icon', href: 'https://tuturuuu.com/favicon.ico' },
        {
          rel: 'shortcut icon',
          href: 'https://tuturuuu.com/favicon-16x16.png',
        },
        {
          rel: 'apple-touch-icon',
          href: 'https://tuturuuu.com/apple-touch-icon.png',
        },
      ],
    };
  },
  component: Root,
  shellComponent: Document,
  notFoundComponent: () => <Missing />,
  errorComponent: ({ error, reset }) => (
    <AppErrorBoundary appName="Apps" error={error} reset={reset} />
  ),
});
function Root() {
  const data = Route.useLoaderData();
  return (
    <GatewayProviders data={data}>
      <Outlet />
    </GatewayProviders>
  );
}
function Document({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  return (
    <html lang={data?.locale ?? 'en'} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen overflow-y-auto bg-root-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
export function Missing() {
  const data = Route.useLoaderData();
  return (
    <main className="p-8">
      <h1>404</h1>
      <a href="/">
        {(data?.locale === 'vi' ? vi : en).appsGateway.metadata.title}
      </a>
    </main>
  );
}
