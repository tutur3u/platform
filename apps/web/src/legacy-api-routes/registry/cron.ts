import type { LegacyApiRouteLoaderMap } from '../types';

export const cronRouteLoaders = {
  'cron/ai/sync-models/route.ts': () => import('../cron/ai/sync-models/route'),
  'cron/discord/daily-report/route.ts': () =>
    import('../cron/discord/daily-report/route'),
  'cron/discord/wol/daily/remind/route.ts': () =>
    import('../cron/discord/wol/daily/remind/route'),
  'cron/finance/exchange-rates/route.ts': () =>
    import('../cron/finance/exchange-rates/route'),
  'cron/inventory/polar-product-sync/route.ts': () =>
    import('../cron/inventory/polar-product-sync/route'),
  'cron/payment/orders/route.ts': () => import('../cron/payment/orders/route'),
  'cron/payment/products/route.ts': () =>
    import('../cron/payment/products/route'),
  'cron/payment/subscriptions/route.ts': () =>
    import('../cron/payment/subscriptions/route'),
  'cron/process-notification-batches/route.ts': () =>
    import('../cron/process-notification-batches/route'),
  'cron/process-post-email-queue/route.ts': () =>
    import('../cron/process-post-email-queue/route'),
  'cron/process-topic-announcement-queue/route.ts': () =>
    import('../cron/process-topic-announcement-queue/route'),
  'cron/workspaces/managed-jobs/route.ts': () =>
    import('../cron/workspaces/managed-jobs/route'),
} satisfies LegacyApiRouteLoaderMap;
