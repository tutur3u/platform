import type { CustomerSeat } from '@tuturuuu/payment/polar';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

export async function fetchProducts() {
  try {
    const polar = createPolarClient();

    const res = await polar.products.list({ isArchived: false });
    return res.result.items ?? [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
}

export async function fetchWorkspaceOrders(wsId: string) {
  try {
    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from('workspace_orders')
      .select('*, workspace_subscription_products (name, price)')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching workspace orders:', error);
      return [];
    }

    return orders.map((order) => ({
      id: order.id,
      createdAt: order.created_at,
      billingReason: order.billing_reason ?? 'unknown',
      totalAmount: order.total_amount ?? 0,
      originalAmount: order.workspace_subscription_products?.price ?? 0,
      currency: order.currency ?? 'usd',
      status: order.status,
      productName: order.workspace_subscription_products?.name ?? 'N/A',
    }));
  } catch (error) {
    console.error('Error fetching workspace orders:', error);
    return [];
  }
}

export async function checkManageSubscriptionPermission(
  wsId: string,
  userId: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('has_workspace_permission', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_permission: 'manage_subscription',
  });

  if (error) {
    console.error('Error checking manage_subscription permission:', error);
    return false;
  }

  return data ?? false;
}

export async function ensureSubscription(wsId: string) {
  // Check for existing subscription first
  const existing = await fetchSubscription(wsId);
  if (existing) return { subscription: existing, error: null };

  // No subscription found - attempt to create one
  try {
    const supabase = await createClient();
    const polar = createPolarClient();

    // Get or create Polar customer
    await getOrCreatePolarCustomer({ polar, supabase, wsId });

    // Create free tier subscription
    const subscription = await createFreeSubscription(polar, supabase, wsId);

    if (!subscription) {
      return {
        subscription: null,
        error: 'SUBSCRIPTION_CREATE_FAILED',
      };
    }

    // Poll database until webhook processes (max 30 seconds)
    const newSubscription = await waitForSubscriptionSync(wsId, 10, 3000);

    if (!newSubscription) {
      return {
        subscription: null,
        error: 'SUBSCRIPTION_SYNC_TIMEOUT',
      };
    }

    return { subscription: newSubscription, error: null };
  } catch (error) {
    console.error('Error ensuring subscription:', error);
    return {
      subscription: null,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

export async function fetchSubscription(wsId: string) {
  const supabase = await createClient();

  const { data: dbSub, error } = await supabase
    .from('workspace_subscriptions')
    .select(
      `
      *,
      workspace_subscription_products (
        id,
        name,
        description,
        price,
        recurring_interval,
        tier,
        pricing_model,
        price_per_seat,
        max_seats
      )
    `
    )
    .eq('ws_id', wsId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !dbSub) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  if (!dbSub.workspace_subscription_products) return null;

  let seatList: CustomerSeat[] = [];

  try {
    const polar = createPolarClient();

    const { seats } = await polar.customerSeats.listSeats({
      subscriptionId: dbSub.polar_subscription_id,
    });

    seatList = seats;
  } catch (err) {
    console.error('Failed to fetch seat list:', err);
  }

  return {
    id: dbSub.id,
    status: dbSub.status,
    createdAt: dbSub.created_at,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    cancelAtPeriodEnd: dbSub.cancel_at_period_end,
    product: dbSub.workspace_subscription_products,
    // Seat-based pricing fields
    seatCount: dbSub.seat_count,
    seatList,
  };
}

export async function waitForSubscriptionSync(
  wsId: string,
  maxAttempts: number = 10,
  delayMs: number = 500
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subscription = await fetchSubscription(wsId);

    if (subscription) {
      console.log(
        `Subscription sync: Found subscription after ${attempt} attempt(s) (${attempt * delayMs}ms)`
      );
      return subscription;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `Subscription sync: Timeout after ${maxAttempts} attempts (${maxAttempts * delayMs}ms)`
  );
  return null;
}
