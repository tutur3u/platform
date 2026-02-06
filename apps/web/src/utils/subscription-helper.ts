import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

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

// Helper function to create a free subscription for a personal workspace in Polar
export async function createFreeSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  // Check if the workspace already has an active subscription
  const hasActive = await hasActiveSubscription(supabase, wsId);
  if (hasActive) {
    console.log(
      `Workspace ${wsId} already has an active subscription, skipping free subscription creation`
    );
    return null;
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .eq('personal', true)
    .maybeSingle();

  if (!workspace) {
    console.error(
      `Personal workspace not found for wsId ${wsId}, cannot create free subscription`
    );
    return null;
  }

  // Get the appropriate FREE product for personal workspace
  const { data: freeProduct, error: productError } = await supabase
    .from('workspace_subscription_products')
    .select('*')
    .eq('pricing_model', 'free')
    .eq('archived', false)
    .limit(1)
    .maybeSingle();

  if (productError || !freeProduct) {
    console.error(
      `No FREE tier product found for workspace, cannot create free subscription:`,
      productError
    );
    return null;
  }

  try {
    // Create a new subscription to the free product via Polar API
    // Note: Polar's subscriptions.create() only works for free products
    const subscription = await polar.subscriptions.create({
      productId: freeProduct.id,
      externalCustomerId: workspace.creator_id,
      metadata: { wsId },
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

export function convertWorkspaceIDToExternalID(wsId: string) {
  return `workspace_${wsId}`;
}

export function convertExternalIDToWorkspaceID(customerId: string) {
  if (customerId.startsWith('workspace_')) {
    return customerId.replace('workspace_', '');
  }
  return null;
}
