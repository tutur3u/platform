import type { Polar, Subscription } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

function privateSchema(supabase: TypedSupabaseClient) {
  return supabase.schema('private');
}

export type CreateFreeSubscriptionResult =
  | {
      status: 'created';
      subscription: Subscription;
    }
  | { status: 'already_active'; subscription: Subscription }
  | { status: 'error'; message: string };

// Helper function to check if a workspace has any active subscriptions
export async function hasActiveSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
) {
  // First check if workspace exists
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .eq('deleted', false)
    .maybeSingle();

  if (!workspace) {
    console.error(
      `Workspace ${wsId} not found, cannot check active subscriptions`
    );

    return { hasWorkspace: false, hasActive: false, subscription: null };
  }

  try {
    const { result } = await polar.subscriptions.list({
      metadata: { wsId },
    });

    const activeSubscription = result.items?.find(
      (sub) => sub.status === 'active'
    );

    // Check if there's at least one active subscription
    return {
      hasWorkspace: true,
      hasActive: !!activeSubscription,
      subscription: activeSubscription ?? null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error checking active subscriptions:', errorMessage);
    // Fail-closed: treat API errors as "active" to prevent duplicate subscriptions
    return { hasWorkspace: true, hasActive: true, subscription: null };
  }
}

// Helper function to create a free subscription for a workspace in Polar
export async function createFreeSubscription(
  polar: Polar,
  supabase: TypedSupabaseClient,
  wsId: string
): Promise<CreateFreeSubscriptionResult> {
  // Check if the workspace already has an active subscription
  const { hasWorkspace, hasActive, subscription } = await hasActiveSubscription(
    polar,
    supabase,
    wsId
  );

  if (!hasWorkspace) {
    console.error(
      `Workspace ${wsId} not found, cannot create free subscription`
    );
    return { status: 'error', message: 'Workspace not found' };
  }

  if (hasActive && subscription) {
    console.log(
      `Workspace ${wsId} already has an active subscription, skipping free subscription creation`
    );
    return { status: 'already_active', subscription };
  }

  let externalCustomerId: string;

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId)
    .eq('deleted', false)
    .maybeSingle();

  if (!workspace) {
    console.error(
      `Workspace not found for wsId ${wsId}, cannot create free subscription`
    );
    return { status: 'error', message: 'Workspace not found' };
  }

  const isPersonal = workspace.personal;

  if (isPersonal) {
    externalCustomerId = workspace.creator_id;
  } else {
    externalCustomerId = `workspace_${wsId}`;
  }

  const { data: freeProduct, error: productError } = await privateSchema(
    supabase
  )
    .from('workspace_subscription_products')
    .select('*')
    .eq('archived', false)
    .eq('pricing_model', 'free')
    .limit(1)
    .maybeSingle();

  // `workspace_subscription_products` lives in the `private` schema and is only
  // readable by `service_role`. Distinguish a lookup/permission failure (e.g.
  // a non-admin client, missing grant, or unset SUPABASE_SECRET_KEY) from a
  // genuinely missing/un-seeded free product so production diagnosis is
  // unambiguous instead of collapsing both into "no product found".
  if (productError) {
    console.error('Free-tier product lookup failed', {
      code: productError.code,
      hint: 'Ensure the read uses createAdminClient (service_role) and that the migration granting service_role on private.workspace_subscription_products is applied.',
      message: productError.message,
      wsId,
    });
    return {
      status: 'error',
      message: `Free-tier product lookup failed: ${productError.message}`,
    };
  }

  if (!freeProduct) {
    console.error('No active free-tier product configured', {
      hint: 'Seed an active (archived=false) pricing_model=free row in private.workspace_subscription_products whose id matches a real Polar free product.',
      wsId,
    });
    return {
      status: 'error',
      message: 'No active free-tier product configured',
    };
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

    return { status: 'created', subscription };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to create free subscription for workspace ${wsId}:`,
      errorMessage
    );
    return { status: 'error', message: errorMessage };
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
