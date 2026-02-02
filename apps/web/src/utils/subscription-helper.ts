import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

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
    console.error('Error fetching free product:', error.message);
    return null;
  }

  return freeProduct;
}

// Helper function to check if a workspace has any active subscriptions
export async function hasActiveSubscription(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { count, error } = await supabase
    .from('workspace_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('status', 'active');

  if (error) {
    console.error('Error checking active subscriptions:', error.message);
    return true; // Assume true to avoid creating duplicate free subscriptions
  }

  return (count ?? 0) > 0;
}

// Helper function to create a free subscription for a workspace in Polar
export async function createFreeSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  // Get the FREE tier product
  const freeProduct = await getFreeProduct(supabase);
  if (!freeProduct) {
    console.error(
      'No FREE tier product found, cannot create free subscription'
    );
    return null;
  }

  // Check if the workspace already has an active subscription
  const hasActive = await hasActiveSubscription(supabase, wsId);
  if (hasActive) {
    console.log(
      `Workspace ${wsId} already has an active subscription, skipping free subscription creation`
    );
    return null;
  }

  try {
    // Create a new subscription to the free product via Polar API
    // Note: Polar's subscriptions.create() only works for free products
    const subscription = await polar.subscriptions.create({
      productId: freeProduct.id,
      customerId: wsId,
    });

    console.log(
      `Created free subscription ${subscription.id} for workspace ${wsId}`
    );
    return subscription;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to create free subscription for workspace ${wsId}:`,
      errorMessage
    );
    return null;
  }
}
