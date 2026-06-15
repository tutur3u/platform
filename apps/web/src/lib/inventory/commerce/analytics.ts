import 'server-only';

import type { InventoryStorefrontAnalytics } from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

const DAY_MS = 24 * 60 * 60 * 1000;

async function getPrivateAdmin() {
  return (await createAdminClient()).schema('private');
}

async function countEvents(
  wsId: string,
  eventType: string,
  since: string
): Promise<number> {
  const privateAdmin = await getPrivateAdmin();
  const { count } = (await privateAdmin
    .from('inventory_storefront_events' as never)
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('event_type', eventType)
    .gte('occurred_at', since)) as { count: number | null };
  return count ?? 0;
}

/**
 * Builds a storefront conversion funnel from `inventory_storefront_events` over
 * the last `days` days: views -> add to cart -> checkout started -> checkout
 * created -> completed, plus the overall view→purchase conversion rate.
 */
export async function getInventoryStorefrontAnalytics(
  wsId: string,
  days = 30
): Promise<InventoryStorefrontAnalytics> {
  const window = Math.max(1, Math.min(days, 365));
  const since = new Date(Date.now() - window * DAY_MS).toISOString();

  const [
    views,
    productViews,
    addToCart,
    checkoutStarted,
    checkoutCreated,
    completed,
  ] = await Promise.all([
    countEvents(wsId, 'view', since),
    countEvents(wsId, 'product_view', since),
    countEvents(wsId, 'add_to_cart', since),
    countEvents(wsId, 'checkout_started', since),
    countEvents(wsId, 'checkout_created', since),
    countEvents(wsId, 'checkout_completed', since),
  ]);

  const totalViews = views + productViews;
  const funnel = [
    { key: 'views', count: totalViews },
    { key: 'addToCart', count: addToCart },
    { key: 'checkoutStarted', count: checkoutStarted },
    { key: 'checkoutCreated', count: checkoutCreated },
    { key: 'completed', count: completed },
  ];

  return {
    days: window,
    funnel,
    conversionRate: totalViews > 0 ? completed / totalViews : 0,
  };
}
