import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { syncSubscriptionToDatabase } from '@/app/api/payment/webhooks/route';
import {
  createNDJSONStream,
  fetchAllRows,
  verifyAdminAccess,
} from '../../../helper';

const POLAR_API_DELAY_MS = 100;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 2: Polar → DB sync.
 * Lists all active Polar subscriptions, finds ones missing from the database,
 * and syncs them. Independent of Phase 1.
 */
export async function POST() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

  // Pre-fetch all active DB subscription Polar IDs for comparison
  const { data: dbSubscriptions, error: dbError } = await fetchAllRows(
    (from, to) =>
      sbAdmin
        .from('workspace_subscriptions')
        .select('polar_subscription_id')
        .eq('status', 'active')
        .range(from, to)
  );

  if (dbError) {
    return NextResponse.json(
      {
        error: `Failed to fetch DB subscriptions: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      },
      { status: 500 }
    );
  }

  const dbPolarIds = new Set(
    dbSubscriptions.map((s) => s.polar_subscription_id)
  );

  return createNDJSONStream(async (send) => {
    let polarSynced = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();
    let processed = 0;

    // Total is unknown upfront since we paginate through Polar
    send({ type: 'start', total: 0 });

    let hasMore = true;
    let page = 1;
    const limit = 100;

    while (hasMore) {
      try {
        await delay(POLAR_API_DELAY_MS);

        const response = await polar.subscriptions.list({
          limit,
          page,
          active: true,
        });

        const polarSubs = response.result?.items ?? [];

        if (polarSubs.length === 0) {
          hasMore = false;
          break;
        }

        for (const polarSub of polarSubs) {
          processed++;
          if (!dbPolarIds.has(polarSub.id)) {
            try {
              await syncSubscriptionToDatabase(polarSub);
              polarSynced++;
            } catch (err) {
              errors++;
              errorDetails.push({
                id: polarSub.id,
                error: `Polar→DB sync failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          } else {
            skipped++;
          }

          send({
            type: 'progress',
            current: processed,
            total: processed,
            polarSynced,
            skipped,
            errors,
          });
        }

        if (polarSubs.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: `polar-page-${page}`,
          error: `Polar list failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        hasMore = false;
      }
    }

    send({
      type: 'complete',
      total: processed,
      polarSynced,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${processed} Polar subs checked: ${polarSynced} synced to DB, ${skipped} already present. ${errors} errors.`,
    });
  });
}

export const maxDuration = 600; // 10 minutes
