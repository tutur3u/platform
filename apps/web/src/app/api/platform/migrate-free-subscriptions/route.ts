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
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ id: string; error: string }> = [];

  // Initialize Polar client
  const polar = createPolarClient();

  try {
    // Find all personal workspaces
    const { data: personalWorkspaces, error: wsError } = await sbAdmin
      .from('workspaces')
      .select('id, workspace_subscriptions!left(id, status)')
      .eq('personal', true);

    if (wsError) {
      console.error('Error fetching personal workspaces:', wsError);
      return NextResponse.json(
        { error: 'Failed to fetch personal workspaces' },
        { status: 500 }
      );
    }

    if (!personalWorkspaces || personalWorkspaces.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No personal workspaces found',
      });
    }

    // Process each personal workspace
    for (const workspace of personalWorkspaces) {
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
          supabase,
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
