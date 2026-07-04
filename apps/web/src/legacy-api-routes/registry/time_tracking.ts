import type { LegacyApiRouteLoaderMap } from '../types';

export const time_trackingRouteLoaders = {
  'time-tracking/export/route.ts': () =>
    import('../time-tracking/export/route'),
} satisfies LegacyApiRouteLoaderMap;
