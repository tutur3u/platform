import type { LegacyApiRouteLoaderMap } from '../types';

export const reportsRouteLoaders = {
  'reports/route.ts': () => import('../reports/route'),
  'reports/upload-url/route.ts': () => import('../reports/upload-url/route'),
} satisfies LegacyApiRouteLoaderMap;
