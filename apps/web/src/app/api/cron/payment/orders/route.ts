import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Cron job to sync orders from Polar.sh to database
 * Runs periodically to ensure all products are up-to-date
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

    if (!DEV_MODE && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Fetch all orders from Polar (paginated)
    let hasMore = true;
    let page = 1;
    const limit = 100;

    while (hasMore) {
      try {
        const response = await polar.orders.list({
          limit,
          page,
        });

        const orders = response.result?.items ?? [];

        if (orders.length === 0) {
          hasMore = false;
          break;
        }

        // Process each order
        for (const order of orders) {
          try {
            const ws_id = order.metadata?.wsId;

            // Skip orders without workspace ID in metadata
            if (!ws_id || typeof ws_id !== 'string') {
              skippedCount++;
              continue;
            }

            // Verify workspace exists
            const { data: workspace, error: workspaceError } = await sbAdmin
              .from('workspaces')
              .select('id')
              .eq('id', ws_id)
              .single();

            if (workspaceError || !workspace) {
              failedCount++;
              errors.push(`Workspace ${ws_id}: ${workspaceError.message}`);
              continue;
            }

            // Prepare order data
            const orderData = {
              ws_id: ws_id,
              polar_order_id: order.id,
              status: order.status as any,
              polar_subscription_id: order.subscriptionId,
              product_id: order.productId,
              total_amount: order.totalAmount,
              currency: order.currency,
              billing_reason: order.billingReason as any,
              user_id: order.customer.externalId,
              created_at:
                order.createdAt instanceof Date
                  ? order.createdAt.toISOString()
                  : new Date(order.createdAt).toISOString(),
              updated_at:
                order.modifiedAt instanceof Date
                  ? order.modifiedAt.toISOString()
                  : order.modifiedAt
                    ? new Date(order.modifiedAt).toISOString()
                    : null,
            };

            // Upsert order
            const { error: dbError } = await sbAdmin
              .from('workspace_orders')
              .upsert([orderData], {
                onConflict: 'polar_order_id',
              });

            if (dbError) {
              failedCount++;
              errors.push(`Order ${order.id}: ${dbError.message}`);
            } else {
              processedCount++;
            }
          } catch (error) {
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Order ${order.id}: ${errorMessage}`);
          }
        }

        // Check if there are more pages
        if (orders.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch page ${page}: ${errorMessage}`);
        hasMore = false;
      }
    }

    return NextResponse.json({
      message: 'Order sync completed',
      processed: processedCount,
      skipped: skippedCount,
      failed: failedCount,
      errors: errors.slice(0, 20), // Limit error messages
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const maxDuration = 300; // 5 minutes
