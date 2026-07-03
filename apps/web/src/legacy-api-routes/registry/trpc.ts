import type { LegacyApiRouteLoaderMap } from '../types';

export const trpcRouteLoaders = {
  'trpc/[trpc]/route.ts': () => import('../trpc/[trpc]/route'),
} satisfies LegacyApiRouteLoaderMap;
