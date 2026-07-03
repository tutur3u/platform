import type { LegacyApiRouteLoaderMap } from '../types';

export const inviteRouteLoaders = {
  'invite/[code]/route.ts': () => import('../invite/[code]/route'),
} satisfies LegacyApiRouteLoaderMap;
