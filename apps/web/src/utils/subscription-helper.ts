import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

// Helper function to check if a workspace has any active subscriptions
export async function hasActiveSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  // First check if workspace exists
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .eq('deleted', false)
    .maybeSingle();

  if (workspaceError) {
    console.error(
      `Error fetching workspace ${wsId}: ${workspaceError.message}`
    );
    return true; // Fail safe
  }

  if (!workspace) {
    console.error(
      `Workspace ${wsId} not found, cannot check active subscriptions`
    );
    return true; // Return true to prevent duplicate creation
  }

  try {
    const { result } = await polar.subscriptions.list({
      metadata: { wsId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sorting: 'status' as any,
    });

    // Check if there's at least one active subscription
    return result.items?.some((sub) => sub.status === 'active') ?? false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error checking active subscriptions:', errorMessage);
    return true; // Assume true to avoid creating duplicate free subscriptions
  }
}

// Helper function to create a free subscription for a workspace in Polar
export async function createFreeSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  // Check if the workspace already has an active subscription
  const hasActive = await hasActiveSubscription(polar, supabase, wsId);
  if (hasActive) {
    console.log(
      `Workspace ${wsId} already has an active subscription, skipping free subscription creation`
    );
    return null;
  }

  let externalCustomerId: string;

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .maybeSingle();

  if (!workspace) {
    console.error(
      `Workspace not found for wsId ${wsId}, cannot create free subscription`
    );
    return null;
  }

  const isPersonal = workspace.personal;

  if (isPersonal) {
    externalCustomerId = workspace.creator_id;
  } else {
    externalCustomerId = `workspace_${wsId}`;
  }

  const { data: freeProduct, error: productError } = await supabase
    .from('workspace_subscription_products')
    .select('*')
    .eq('archived', false)
    .eq('pricing_model', 'free')
    .limit(1)
    .maybeSingle();

  if (productError || !freeProduct) {
    console.error(
      `No FREE tier product found for ${isPersonal ? 'personal' : 'non-personal'} workspace, cannot create free subscription:`,
      productError
    );
    return null;
  }

  try {
    // Create a new subscription to the free product via Polar API
    // Note: Polar's subscriptions.create() only works for free products
    const subscription = await polar.subscriptions.create({
      productId: freeProduct.id,
      externalCustomerId,
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
