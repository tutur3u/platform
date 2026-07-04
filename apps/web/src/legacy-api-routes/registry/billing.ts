import type { LegacyApiRouteLoaderMap } from '../types';

export const billingRouteLoaders = {
  'billing/[wsId]/invoice/route.ts': () =>
    import('../billing/[wsId]/invoice/route'),
} satisfies LegacyApiRouteLoaderMap;
