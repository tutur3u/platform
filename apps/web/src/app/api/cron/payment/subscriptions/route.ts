import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { syncSubscriptionToDatabase } from '@/utils/polar-subscription-helper';

/**
 * Cron job to sync subscriptions from Polar.sh to database
 * Runs periodically to ensure all subscriptions are up-to-date
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

    // Fetch all subscriptions from Polar (paginated)
    let hasMore = true;
    let page = 1;
    const limit = 100;

    while (hasMore) {
      try {
        // Polar SDK subscriptions.list requires organizationId
        // If not provided, it will use the default organization from the access token
        const response = await polar.subscriptions.list({
          limit,
          page,
        });

        const subscriptions = response.result?.items ?? [];

        if (subscriptions.length === 0) {
          hasMore = false;
          break;
        }

        // Process each subscription
        for (const subscription of subscriptions) {
          try {
            const wsId = subscription.metadata?.wsId;

            if (!wsId || typeof wsId !== 'string') {
              skippedCount++;
              continue;
            }

            // Verify workspace exists
            const { data: workspace, error: workspaceError } = await sbAdmin
              .from('workspaces')
              .select('id')
              .eq('id', wsId)
              .single();

            if (workspaceError || !workspace) {
              skippedCount++;
              errors.push(
                `Subscription ${subscription.id}: ${workspaceError?.message ?? 'Workspace not found'}`
              );
              continue;
            }

            await syncSubscriptionToDatabase(sbAdmin, subscription);
            processedCount++;
          } catch (error) {
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Subscription ${subscription.id}: ${errorMessage}`);
          }
        }

        // Check if there are more pages
        if (subscriptions.length < limit) {
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
      message: 'Subscription sync completed',
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
