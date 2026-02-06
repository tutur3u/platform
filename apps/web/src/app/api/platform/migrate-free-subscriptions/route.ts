import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

export async function POST() {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify root workspace membership and permission
  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_user_id: user.id,
      p_ws_id: ROOT_WORKSPACE_ID,
      p_permission: 'manage_workspace_roles',
    }
  );

  if (permissionError || !hasPermission) {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  let created = 0;
  const skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ id: string; error: string }> = [];

  // Initialize Polar client
  const polar = createPolarClient();

  try {
    // Find all workspaces
    const { data: allWorkspaces, error: wsError } = await sbAdmin
      .from('workspaces')
      .select('id, personal');

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    if (!allWorkspaces || allWorkspaces.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No workspaces found',
      });
    }

    // Get all active subscriptions
    const { data: activeSubscriptions, error: subError } = await sbAdmin
      .from('workspace_subscriptions')
      .select('ws_id')
      .eq('status', 'active');

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }

    // Filter workspaces without active subscriptions
    const activeWsIds = new Set(
      activeSubscriptions?.map((sub) => sub.ws_id) || []
    );
    const workspacesWithoutSubs = allWorkspaces.filter(
      (ws) => !activeWsIds.has(ws.id)
    );

    if (workspacesWithoutSubs.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No workspaces found without active subscriptions',
      });
    }

    // Process each workspace
    for (const workspace of workspacesWithoutSubs) {
      try {
        // Get or create Polar customer
        await getOrCreatePolarCustomer({
          polar,
          supabase: sbAdmin,
          wsId: workspace.id,
        });

        // Create free subscription using helper function
        // This will handle both personal (amountType=free) and non-personal (amountType=seated, tier=FREE)
        const subscription = await createFreeSubscription(
          polar,
          sbAdmin,
          workspace.id
        );

        if (!subscription) {
          errors++;
          errorDetails.push({
            id: workspace.id,
            error: 'Failed to create free subscription',
          });
          continue;
        }

        created++;
      } catch (err) {
        errors++;
        errorDetails.push({
          id: workspace.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      created,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      message: `Migration completed: ${created} subscriptions created, ${skipped} skipped, ${errors} errors`,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown migration error',
      },
      { status: 500 }
    );
  }
}
