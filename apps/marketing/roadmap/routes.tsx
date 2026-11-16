/**
 * The public roadmap as marketing-owned routes (D221), rendered from the
 * same source as apps/roadmap (@tuturuuu/roadmap-core). They mirror
 * apps/roadmap's routes: per-page heads, the roadmap document head, <html>
 * lang and Sorbet (sorbet-page.ts) through BridgeDocument's loader-data
 * attributes, PublicSatelliteProviders, and the shared status pages.
 *
 * Only built with MARKETING_ROADMAP_ROUTES=1 (scripts/roadmap-routes.mjs);
 * otherwise nothing imports this module and marketing serves no roadmap
 * route.
 */
import {
  type AnyRoute,
  createRoute,
  type ErrorComponentProps,
  lazyRouteComponent,
  notFound,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import type { Lang } from '@tuturuuu/roadmap-core/components/shared.tsx';
import { roadmapDocumentHead } from '@tuturuuu/roadmap-core/document-head.ts';
import { edufestHead } from '@tuturuuu/roadmap-core/pages/edufest-head.ts';
import { roadmapHead } from '@tuturuuu/roadmap-core/pages/roadmap-head.ts';
import { langFromPathname } from '@tuturuuu/roadmap-core/seo.ts';
import { sorbetPage } from '@tuturuuu/roadmap-core/sorbet-page.ts';
import { PublicSatelliteProviders } from '@tuturuuu/satellite/public';
import { StatusPage } from '@tuturuuu/ui/custom/status-page';
import type { ReactNode } from 'react';
import styles from '../src/roadmap/styles.css?url';

const RoadmapPage = lazyRouteComponent(
  () => import('@tuturuuu/roadmap-core/pages/roadmap.tsx'),
  'RoadmapPage'
);
const EduFestWorkshopPage = lazyRouteComponent(
  () => import('@tuturuuu/roadmap-core/pages/edufest.tsx'),
  'EduFestWorkshopPage'
);

type Head = ReturnType<typeof roadmapHead> | ReturnType<typeof edufestHead>;

/** The roadmap document head, then the page's own (as apps/roadmap's root and page routes). */
function pageHead(head: Head) {
  const document = roadmapDocumentHead(styles);
  return {
    ...head,
    meta: [...document.meta, ...(head.meta ?? [])],
    links: [...document.links, ...(head.links ?? [])],
  };
}

/** BridgeDocument's <html>/<body> attributes for an app-relative roadmap path. */
function documentAttributes(pathname: string) {
  return {
    html: {
      lang: langFromPathname(pathname),
      ...(sorbetPage(pathname) ? { 'data-ui': 'sorbet' } : {}),
    },
    body: {},
  };
}

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
  return (
    <PublicSatelliteProviders>
      <StatusPage {...useRoadmapStatus()} variant="not-found" />
    </PublicSatelliteProviders>
  );
}

function RoadmapError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (import.meta.env.SSR) console.error('Roadmap render failed', error);
  return (
    <PublicSatelliteProviders>
      <StatusPage
        {...useRoadmapStatus()}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
        variant="error"
      />
    </PublicSatelliteProviders>
  );
}

function page(children: ReactNode) {
  return <PublicSatelliteProviders>{children}</PublicSatelliteProviders>;
}

const status = {
  notFoundComponent: RoadmapNotFound,
  errorComponent: RoadmapError,
};

/**
 * The roadmap's routes under marketing's root route: a /roadmap layout with
 * the pages apps/roadmap serves under its /roadmap basepath, plus its 404.
 */
export function roadmapRoutes(root: AnyRoute): AnyRoute[] {
  const layout = createRoute({
    getParentRoute: () => root,
    path: '/roadmap',
    ...status,
  });
  const roadmap = (path: string, lang: Lang) =>
    createRoute({
      getParentRoute: () => layout,
      path,
      loader: ({ location }) => documentAttributes(location.pathname),
      head: () => pageHead(roadmapHead(lang)),
      component: () => page(<RoadmapPage lang={lang} />),
      ...status,
    });
  const workshop = (path: string, lang: Lang) =>
    createRoute({
      getParentRoute: () => layout,
      path,
      loader: ({ location }) => documentAttributes(location.pathname),
      head: () => pageHead(edufestHead(lang)),
      component: () => page(<EduFestWorkshopPage lang={lang} />),
      ...status,
    });
  layout.addChildren([
    roadmap('/', 'en'),
    roadmap('vi', 'vi'),
    workshop('workshops/edufest-2026', 'en'),
    workshop('vi/workshops/edufest-2026', 'vi'),
    // Any other /roadmap path: the roadmap's own 404, not marketing's.
    createRoute({
      getParentRoute: () => layout,
      path: '$',
      loader: () => {
        throw notFound();
      },
      ...status,
    }),
  ]);
  return [layout];
}
