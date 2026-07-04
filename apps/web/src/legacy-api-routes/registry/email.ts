import type { LegacyApiRouteLoaderMap } from '../types';

export const emailRouteLoaders = {
  'email/unsubscribe/route.ts': () => import('../email/unsubscribe/route'),
} satisfies LegacyApiRouteLoaderMap;
