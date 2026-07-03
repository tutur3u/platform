import type { LegacyApiRouteLoaderMap } from '../types';

export const wsIdRouteLoaders = {
  '[wsId]/crawlers/domains/route.ts': () =>
    import('../[wsId]/crawlers/domains/route'),
  '[wsId]/crawlers/list/route.ts': () =>
    import('../[wsId]/crawlers/list/route'),
  '[wsId]/crawlers/uncrawled/route.ts': () =>
    import('../[wsId]/crawlers/uncrawled/route'),
} satisfies LegacyApiRouteLoaderMap;
