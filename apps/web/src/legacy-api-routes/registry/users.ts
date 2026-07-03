import type { LegacyApiRouteLoaderMap } from '../types';

export const usersRouteLoaders = {
  'users/search/route.ts': () => import('../users/search/route'),
} satisfies LegacyApiRouteLoaderMap;
