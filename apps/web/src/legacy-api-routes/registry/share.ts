import type { LegacyApiRouteLoaderMap } from '../types';

export const shareRouteLoaders = {
  'share/course/[courseId]/route.ts': () =>
    import('../share/course/[courseId]/route'),
} satisfies LegacyApiRouteLoaderMap;
