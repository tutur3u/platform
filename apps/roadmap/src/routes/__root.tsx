import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import type { ReactNode } from 'react';
import { roadmapDocumentHead } from '@tuturuuu/roadmap-core/document-head.ts';
import { langFromPathname } from '@tuturuuu/roadmap-core/seo.ts';
import { sorbetPage } from '@tuturuuu/roadmap-core/sorbet-page.ts';
import styles from '../styles.css?url';

export const Route = createRootRoute({
  head: () => roadmapDocumentHead(styles),
  component: Outlet,
  shellComponent: Document,
  notFoundComponent: RoadmapNotFound,
  errorComponent: RoadmapError,
});

/** Shared Tuturuuu status page in the visitor's roadmap language. */
function useRoadmapStatus() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lang = langFromPathname(pathname);
  return {
    appName: 'Roadmap',
    appHref: lang === 'vi' ? '/roadmap/vi' : '/roadmap',
    locale: lang,
  };
}

function RoadmapNotFound() {
  return <StatusPage {...useRoadmapStatus()} variant="not-found" />;
}

function RoadmapError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (import.meta.env.SSR) console.error('Roadmap render failed', error);
  return (
    <StatusPage
      {...useRoadmapStatus()}
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
      variant="error"
    />
  );
}

function Document({ children }: { children: ReactNode }) {
  // Each language has its own URL, so the document language follows it;
  // the roadmap renders in Sorbet (see sorbet-page.ts).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <html
      lang={langFromPathname(pathname)}
      data-ui={sorbetPage(pathname) ? 'sorbet' : undefined}
      suppressHydrationWarning
    >
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
