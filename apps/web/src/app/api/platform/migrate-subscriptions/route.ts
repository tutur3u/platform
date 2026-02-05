import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function POST() {
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

    // Fetch all active subscriptions that are NOT seat-based
    const { data: subscriptions, error: subError } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        `
        *,
        workspaces!inner (personal),
        workspace_subscription_products!inner (
          id,
          name,
          tier,
          recurring_interval
        )
      `
      )
      .eq('status', 'active')
      .eq('workspaces.personal', false)
      .neq('workspace_subscription_products.pricing_model', 'seat_based');

    if (subError) {
      throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        message: 'No active fixed-price subscriptions found to migrate',
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

    // Iterate and cancel old subscriptions - webhooks will create new seat-based ones
    for (const sub of subscriptions) {
      try {
        console.log(
          `Cancelling subscription ${sub.id} (${sub.polar_subscription_id}). Webhook will create new seat-based subscription.`
        );

        // Cancel the old fixed-price subscription
        await polar.subscriptions.revoke({
          id: sub.polar_subscription_id,
        });

        console.log(
          `Successfully cancelled subscription ${sub.id}. Webhook will handle creating new seat-based subscription.`
        );

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
