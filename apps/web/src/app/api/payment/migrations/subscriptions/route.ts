import { createPolarClient } from '@tuturuuu/payment/polar/server';
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
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ id: string; error: string }> = [];

  // Initialize Polar client
  const polar = createPolarClient();

  try {
    // Find all workspaces
    const { data: workspaces, error: wsError } = await sbAdmin
      .from('workspaces')
      .select('id, workspace_subscriptions!left(id, status)');

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No workspaces found',
      });
    }

    // Process each workspace
    for (const workspace of workspaces) {
      try {
        if (
          workspace.workspace_subscriptions.some(
            (sub) => sub.status === 'active'
          )
        ) {
          // Skip workspaces with active subscriptions
          skipped++;
          continue;
        }
        // Get or create Polar customer
        await getOrCreatePolarCustomer({
          polar,
          supabase: sbAdmin,
          wsId: workspace.id,
        });

        // Create free subscription using helper function
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

export async function DELETE() {
  try {
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

    // Fetch all active subscriptions
    const { data: subscriptions, error: subError } = await sbAdmin
      .from('workspace_subscriptions')
      .select('*')
      .eq('status', 'active');

    if (subError) {
      throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        message: 'No active subscriptions found to migrate',
        processed: 0,
        skipped: 0,
        errors: 0,
      });
    }

    const polar = createPolarClient();
    let processed = 0;
    const skipped = 0;
    let errors = 0;
    const errorDetails: any[] = [];

    // Iterate and cancel old subscriptions
    for (const sub of subscriptions) {
      try {
        console.log(
          `Cancelling subscription ${sub.id} (${sub.polar_subscription_id}).`
        );

        // Cancel the old subscription
        await polar.subscriptions.revoke({
          id: sub.polar_subscription_id,
        });

        console.log(`Successfully cancelled subscription ${sub.id}.`);

        processed++;
      } catch (err) {
        console.error(`Error cancelling sub ${sub.id}:`, err);
        errors++;
        errorDetails.push({
          id: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors,
      errorDetails,
    });
  } catch (error) {
    console.error('Global migration error:', error);
    return NextResponse.json(
      { error: 'Internal server error during migration' },
      { status: 500 }
    );
  }
}
