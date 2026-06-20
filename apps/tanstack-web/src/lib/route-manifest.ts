import routeManifest from '../../migration/route-manifest.json';

export type RouteManifestSummary = {
  apiRoutes: number;
  cronRoutes: number;
  layouts: number;
  methodCounts: Record<
    'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT',
    number
  >;
  pages: number;
  routeHandlers: number;
  total: number;
};

export type RouteManifestRoute = {
  id: string;
  kind: string;
  methods: string[];
  routePath: string;
  sourceFile: string;
  status: 'accepted-removal' | 'legacy-next' | 'migrated';
  targetOwner: 'rust-backend' | 'tanstack-start';
};

export type RouteManifestProgressBucket = {
  acceptedRemoval: number;
  key: string;
  label: string;
  legacyNext: number;
  migrated: number;
  percentComplete: number;
  remaining: number;
  terminal: number;
  total: number;
  unknownStatus: number;
};

export type RouteManifestProgress = {
  byKind: RouteManifestProgressBucket[];
  byOwner: RouteManifestProgressBucket[];
  topLegacyRoutes: Pick<
    RouteManifestRoute,
    'kind' | 'methods' | 'routePath' | 'sourceFile' | 'status' | 'targetOwner'
  >[];
  totals: RouteManifestProgressBucket;
};

export const tanstackRouteManifest = routeManifest as {
  generatedBy: string;
  progress: RouteManifestProgress;
  routes: RouteManifestRoute[];
  summary: RouteManifestSummary;
};
