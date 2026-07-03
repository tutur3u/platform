import type { LegacyApiRouteLoaderMap } from '../types';

export const notificationsRouteLoaders = {
  'notifications/send-immediate/route.ts': () =>
    import('../notifications/send-immediate/route'),
} satisfies LegacyApiRouteLoaderMap;
