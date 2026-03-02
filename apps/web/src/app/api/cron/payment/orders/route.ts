import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { syncOrderToDatabase } from '@/utils/polar-order-helper';

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
          const wsId = order.metadata?.wsId;

          if (!wsId || typeof wsId !== 'string') {
            skippedCount++;
            continue;
          }

          try {
            await syncOrderToDatabase(sbAdmin, order);
            processedCount++;
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
