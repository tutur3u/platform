import type { LegacyApiRouteLoaderMap } from '../types';

export const healthRouteLoaders = {
  'health/route.ts': () => import('../health/route'),
} satisfies LegacyApiRouteLoaderMap;
