import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';

/**
 * Fetch active subscription for a workspace from database
 * @param wsId - Workspace ID
 * @returns Subscription object or null if not found
 */
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
        tier
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

  return {
    id: dbSub.id,
    status: dbSub.status,
    createdAt: dbSub.created_at,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    cancelAtPeriodEnd: dbSub.cancel_at_period_end,
    product: dbSub.workspace_subscription_products,
  };
}

/**
 * Poll the database until subscription appears or timeout
 * Used after creating a subscription to wait for webhook processing
 *
 * @param wsId - Workspace ID
 * @param maxAttempts - Maximum polling attempts (default: 10 = 5 seconds)
 * @param delayMs - Delay between polls in milliseconds (default: 500ms)
 * @returns Subscription object or null on timeout
 */
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

// Helper function to get the FREE tier product from the database
export async function getFreeProduct(supabase: TypedSupabaseClient) {
  const { data: freeProduct, error } = await supabase
    .from('workspace_subscription_products')
    .select('id, name, tier')
    .eq('tier', 'FREE')
    .eq('archived', false)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Webhook: Error fetching free product:', error.message);
    return null;
  }

  return freeProduct;
}

// Helper function to check if a workspace has any active subscriptions
export async function hasActiveSubscription(
  supabase: TypedSupabaseClient,
  ws_id: string
) {
  const { count, error } = await supabase
    .from('workspace_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', ws_id)
    .eq('status', 'active');

  if (error) {
    console.error(
      'Webhook: Error checking active subscriptions:',
      error.message
    );
    return true; // Assume true to avoid creating duplicate free subscriptions
  }

  return (count ?? 0) > 0;
}

// Helper function to create a free subscription for a workspace in Polar
export async function createFreeSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  ws_id: string,
  customerId: string
) {
  // Get the FREE tier product
  const freeProduct = await getFreeProduct(supabase);
  if (!freeProduct) {
    console.error(
      'Webhook: No FREE tier product found, cannot create free subscription'
    );
    return null;
  }

  // Check if the workspace already has an active subscription
  const hasActive = await hasActiveSubscription(supabase, ws_id);
  if (hasActive) {
    console.log(
      `Webhook: Workspace ${ws_id} already has an active subscription, skipping free subscription creation`
    );
    return null;
  }

  try {
    // Create a new subscription to the free product via Polar API
    // Note: Polar's subscriptions.create() only works for free products
    const subscription = await polar.subscriptions.create({
      productId: freeProduct.id,
      customerId: customerId,
      metadata: {
        wsId: ws_id,
      },
    });

    console.log(
      `Webhook: Created free subscription ${subscription.id} for workspace ${ws_id}`
    );
    return subscription;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Webhook: Failed to create free subscription for workspace ${ws_id}:`,
      errorMessage
    );
    return null;
  }
}
