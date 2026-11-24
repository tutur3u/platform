import type {
  UpgradePlan,
  UpgradePlanCycle,
  WorkspaceUpgradeOptions,
} from '@tuturuuu/internal-api';
import { checkManageSubscriptionPermission } from '@tuturuuu/payment-core/billing-helper';
import { PUBLIC_WORKSPACE_PRODUCT_IDS } from '@tuturuuu/payment-core/public-prices';
import { isSelfServeWorkspaceProduct } from '@tuturuuu/payment-core/self-serve-products';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function toCycle(interval: string | null): UpgradePlanCycle | null {
  return interval === 'month' || interval === 'year' ? interval : null;
}

/**
 * What the Upgrade dialog needs: the self-serve plans and the workspace's
 * current plan. Only members with `manage_subscription` may read it, from web
 * or any satellite app session. Checkout itself stays on the pay billing page.
 */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId: rawWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(request, rawWsId);
  if (!access.ok) return access.response;

  const wsId = access.permissions.wsId;
  const db = await createAdminClient({ noCookie: true });
  const canManage = await checkManageSubscriptionPermission(
    db,
    wsId,
    access.user.id
  );
  if (!canManage) {
    return NextResponse.json(
      { message: 'Workspace permission denied' },
      { status: 403, headers: NO_STORE }
    );
  }

  try {
    const products = db
      .schema('private')
      .from('workspace_subscription_products');
    const [catalog, subscription] = await Promise.all([
      products
        .select(
          'id,name,description,tier,pricing_model,price,price_per_seat,recurring_interval,min_seats,max_seats,archived'
        )
        .eq('archived', false),
      db
        .from('workspace_subscriptions')
        .select(
          'product_id,status,current_period_end,cancel_at_period_end,seat_count'
        )
        .eq('ws_id', wsId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (catalog.error) throw catalog.error;
    if (subscription.error) throw subscription.error;

    const plans: UpgradePlan[] = [];
    let freeListed = false;
    for (const row of catalog.data ?? []) {
      const selfServe = isSelfServeWorkspaceProduct({
        archived: row.archived,
        price: row.price,
        pricing_model: row.pricing_model,
        tier: row.tier,
      });
      if (!selfServe) continue;
      const isFree = row.tier === 'FREE';
      if (isFree ? freeListed : !PUBLIC_WORKSPACE_PRODUCT_IDS.includes(row.id))
        continue;
      freeListed ||= isFree;
      plans.push({
        billingCycle: toCycle(row.recurring_interval),
        description: row.description,
        id: row.id,
        maxSeats: row.max_seats,
        minSeats: row.min_seats,
        name: row.name ?? row.tier ?? '',
        price: isFree ? 0 : (row.price ?? 0),
        pricePerSeat: row.price_per_seat,
        pricingModel: row.pricing_model ?? 'free',
        tier: row.tier ?? 'FREE',
      });
    }

    const active = subscription.data;
    const activeProduct = active?.product_id
      ? (catalog.data ?? []).find((row) => row.id === active.product_id)
      : undefined;
    const currentProduct =
      activeProduct ??
      (active?.product_id
        ? (
            await products
              .select('id,name,tier,recurring_interval')
              .eq('id', active.product_id)
              .maybeSingle()
          ).data
        : null);

    const body: WorkspaceUpgradeOptions = {
      billingUrl: getPayBillingUrl(wsId),
      currentPlan:
        active && currentProduct
          ? {
              billingCycle: toCycle(currentProduct.recurring_interval),
              cancelAtPeriodEnd: active.cancel_at_period_end ?? false,
              currentPeriodEnd: active.current_period_end ?? null,
              name: currentProduct.name ?? currentProduct.tier ?? '',
              productId: currentProduct.id,
              seatCount: active.seat_count ?? null,
              status: active.status ?? 'unknown',
              tier: currentProduct.tier ?? null,
            }
          : null,
      plans,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error('Failed to load workspace upgrade options', error);
    return NextResponse.json(
      { message: 'Failed to load upgrade options' },
      { status: 500, headers: NO_STORE }
    );
  }
}
