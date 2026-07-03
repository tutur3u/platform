import type { LegacyApiRouteLoaderMap } from '../types';

export const v2RouteLoaders = {
  'v2/workspaces/[wsId]/migrate/[module]/route.ts': () =>
    import('../v2/workspaces/[wsId]/migrate/[module]/route'),
  'v2/workspaces/[wsId]/route.ts': () =>
    import('../v2/workspaces/[wsId]/route'),
} satisfies LegacyApiRouteLoaderMap;
