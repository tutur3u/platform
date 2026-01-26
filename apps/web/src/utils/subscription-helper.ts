import type { Polar } from '@tuturuuu/payment/polar';
import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceProductTier } from 'tuturuuu/types';

// Helper function to get the FREE tier product from the database
export async function getProduct(
  sbAdmin: SupabaseClient,
  tier: WorkspaceProductTier
) {
  const { data: freeProduct, error } = await sbAdmin
    .from('workspace_subscription_products')
    .select('id, name, tier')
    .eq('tier', tier)
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
  sbAdmin: SupabaseClient,
  ws_id: string
) {
  const { count, error } = await sbAdmin
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
export async function createSubscription(
  polar: Polar,
  sbAdmin: SupabaseClient,
  ws_id: string,
  customerId: string,
  tier: WorkspaceProductTier
) {
  // Get the FREE tier product
  const freeProduct = await getProduct(sbAdmin, tier);
  if (!freeProduct) {
    console.error(
      'Webhook: No FREE tier product found, cannot create free subscription'
    );
    return null;
  }

  // Check if the workspace already has an active subscription
  const hasActive = await hasActiveSubscription(sbAdmin, ws_id);
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
