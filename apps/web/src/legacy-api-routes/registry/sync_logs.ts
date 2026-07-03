import type { LegacyApiRouteLoaderMap } from '../types';

export const sync_logsRouteLoaders = {
  'sync-logs/route.ts': () => import('../sync-logs/route'),
} satisfies LegacyApiRouteLoaderMap;
