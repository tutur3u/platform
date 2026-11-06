import {
  HeadContent,
  notFound,
  Scripts,
  useLoaderData,
  useMatches,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { appBaseHeadScript } from './base-path';
import type { BridgeHead } from './metadata';

/**
 * Start routes for the generic page adapter. The app's generated
 * `page-route.tsx` owns the server function (so Start compiles it) and passes
 * its caller here; this module only shapes route options and the document.
 */
export interface BridgePageData {
  pattern: string;
  head: BridgeHead;
  html: Record<string, string | number | boolean>;
  body: Record<string, string | number | boolean>;
  /** The RSC renderable returned by `renderServerComponent`. */
  content: unknown;
}

export interface BridgePageRouteOptions {
  /** Loads the page for an app-relative href; `null` means not found. */
  load: (href: string) => Promise<BridgePageData | null>;
}

function BridgePageView() {
  const data = useLoaderData({ strict: false }) as BridgePageData | undefined;
  return <>{data?.content as ReactNode}</>;
}

export function createBridgePageRoute(options: BridgePageRouteOptions) {
  return {
    loader: async ({ location }: { location: { href: string } }) => {
      const data = await options.load(location.href);
      if (!data) throw notFound();
      return data;
    },
    head: ({ loaderData }: { loaderData?: BridgePageData }) =>
      loaderData ? loaderData.head : {},
    component: BridgePageView,
  };
}

function isPageData(value: unknown): value is BridgePageData {
  return typeof value === 'object' && value !== null && 'html' in value;
}

/** Start shell carrying the matched page's root `<html>`/`<body>` attributes. */
export function BridgeDocument({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const page = matches.map((match) => match.loaderData).findLast(isPageData);
  return (
    <html lang="en" {...(page?.html ?? {})} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body {...(page?.body ?? {})} suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function BridgeNotFound() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>404</h1>
    </main>
  );
}

export function createBridgeRootRoute() {
  return {
    // The request's mount must reach the browser before the router starts.
    head: () => ({ scripts: [appBaseHeadScript()] }),
    shellComponent: BridgeDocument,
    notFoundComponent: BridgeNotFound,
  };
}
