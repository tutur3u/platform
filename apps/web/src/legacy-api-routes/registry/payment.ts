import type { LegacyApiRouteLoaderMap } from '../types';

export const paymentRouteLoaders = {
  'payment/credit-packs/checkouts/route.ts': () =>
    import('../payment/credit-packs/checkouts/route'),
  'payment/customer-portal/subscriptions/[subscriptionId]/route.ts': () =>
    import('../payment/customer-portal/subscriptions/[subscriptionId]/route'),
  'payment/migrations/subscriptions/cross-check/phase-1/route.ts': () =>
    import('../payment/migrations/subscriptions/cross-check/phase-1/route'),
  'payment/migrations/subscriptions/cross-check/phase-2/route.ts': () =>
    import('../payment/migrations/subscriptions/cross-check/phase-2/route'),
  'payment/migrations/subscriptions/cross-check/phase-3/route.ts': () =>
    import('../payment/migrations/subscriptions/cross-check/phase-3/route'),
  'payment/migrations/subscriptions/cross-check/route.ts': () =>
    import('../payment/migrations/subscriptions/cross-check/route'),
  'payment/migrations/subscriptions/duplicates/route.ts': () =>
    import('../payment/migrations/subscriptions/duplicates/route'),
  'payment/migrations/subscriptions/route.ts': () =>
    import('../payment/migrations/subscriptions/route'),
  'payment/migrations/subscriptions/unexisted-workspaces/route.ts': () =>
    import('../payment/migrations/subscriptions/unexisted-workspaces/route'),
  'payment/orders/[orderId]/invoice/route.ts': () =>
    import('../payment/orders/[orderId]/invoice/route'),
  'payment/seats/route.ts': () => import('../payment/seats/route'),
  'payment/subscriptions/[subscriptionId]/change/route.ts': () =>
    import('../payment/subscriptions/[subscriptionId]/change/route'),
  'payment/subscriptions/[subscriptionId]/checkouts/route.ts': () =>
    import('../payment/subscriptions/[subscriptionId]/checkouts/route'),
  'payment/subscriptions/[subscriptionId]/preview/route.ts': () =>
    import('../payment/subscriptions/[subscriptionId]/preview/route'),
  'payment/webhooks/route.ts': () => import('../payment/webhooks/route'),
} satisfies LegacyApiRouteLoaderMap;
