import type { LegacyApiRouteLoaderMap } from '../types';

export const cliRouteLoaders = {
  'cli/auth/refresh/route.ts': () => import('../cli/auth/refresh/route'),
  'cli/auth/start/route.ts': () => import('../cli/auth/start/route'),
  'cli/auth/verify/route.ts': () => import('../cli/auth/verify/route'),
} satisfies LegacyApiRouteLoaderMap;
