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

    // 1. Fetch all active subscriptions that are NOT seat-based
    const { data: subscriptions, error: subError } = await sbAdmin
      .from('workspace_subscriptions')
      .select(
        `
        *,
        workspace_subscription_products!inner (
          id,
          name,
          tier,
          recurring_interval
        )
      `
      )
      .eq('status', 'active')
      .neq('pricing_model', 'seat_based');

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

    // 2. Fetch all active seat-based products to map against
    const { data: seatProducts, error: prodError } = await sbAdmin
      .from('workspace_subscription_products')
      .select('*')
      .eq('pricing_model', 'seat_based')
      .eq('archived', false);

    if (prodError) {
      throw new Error(`Failed to fetch products: ${prodError.message}`);
    }

    const polar = createPolarClient();
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: any[] = [];

    // 3. Iterate and migrate
    for (const sub of subscriptions) {
      try {
        const currentProduct = sub.workspace_subscription_products;
        if (!currentProduct) {
          skipped++;
          continue;
        }

        // Find matching seat-based product
        const targetProduct = seatProducts.find(
          (p) =>
            p.tier === currentProduct.tier &&
            p.recurring_interval === currentProduct.recurring_interval
        );

        if (!targetProduct) {
          console.log(
            `Skipping sub ${sub.id}: No matching seat-based product for tier ${currentProduct.tier} / ${currentProduct.recurring_interval}`
          );
          skipped++;
          continue;
        }

        // Calculate member count for initial seats
        const { count: memberCount } = await sbAdmin
          .from('workspace_members')
          .select('*', { count: 'exact', head: true })
          .eq('ws_id', sub.ws_id);

        const seats = Math.max(1, memberCount ?? 1);

        console.log(
          `Migrating sub ${sub.id} (${sub.polar_subscription_id}) to product ${targetProduct.id} with ${seats} seats`
        );

        // STEP 1: Change the product (fixed-price → seat-based)
        console.log(`  Step 1: Changing product to ${targetProduct.id}...`);
        await polar.subscriptions.update({
          id: sub.polar_subscription_id,
          subscriptionUpdate: {
            productId: targetProduct.id,
            prorationBehavior: 'invoice',
          },
        });

        // STEP 2: Set the initial seat count
        console.log(`  Step 2: Setting seat count to ${seats}...`);
        await polar.subscriptions.update({
          id: sub.polar_subscription_id,
          subscriptionUpdate: {
            seats,
            prorationBehavior: 'invoice',
          },
        });

        console.log(`  Successfully migrated subscription ${sub.id}`);

        // Update local DB to reflect change immediately
        const { error: updateError } = await sbAdmin
          .from('workspace_subscriptions')
          .update({
            pricing_model: 'seat_based',
            product_id: targetProduct.id,
            seat_count: seats,
            price_per_seat: targetProduct.price_per_seat,
          })
          .eq('id', sub.id);

        if (updateError) {
          throw new Error(
            `Failed to update local subscription record: ${updateError.message}`
          );
        }

        processed++;
      } catch (err) {
        console.error(`Error migrating sub ${sub.id}:`, err);
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
