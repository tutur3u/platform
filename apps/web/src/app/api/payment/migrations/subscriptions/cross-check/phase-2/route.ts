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
    let duplicatesRevoked = 0;
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
            duplicatesRevoked,
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

    // --- Auto-dedup pass: revoke older duplicates per workspace ---
    if (polarSynced > 0) {
      try {
        const { data: freshSubs, error: freshError } = await fetchAllRows(
          (from, to) =>
            sbAdmin
              .from('workspace_subscriptions')
              .select('id, ws_id, polar_subscription_id, created_at')
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .range(from, to)
        );

        if (freshError) {
          errorDetails.push({
            id: 'dedup-fetch',
            error: `Dedup fetch failed: ${freshError instanceof Error ? freshError.message : String(freshError)}`,
          });
          errors++;
        } else {
          // Group by workspace, keeping order (latest first)
          const byWorkspace = new Map<string, typeof freshSubs>();
          for (const sub of freshSubs) {
            const existing = byWorkspace.get(sub.ws_id);
            if (existing) {
              existing.push(sub);
            } else {
              byWorkspace.set(sub.ws_id, [sub]);
            }
          }

          // Collect older duplicates (all but latest per workspace)
          const dupsToRevoke: typeof freshSubs = [];
          for (const [, wsSubs] of byWorkspace) {
            if (wsSubs.length > 1) {
              dupsToRevoke.push(...wsSubs.slice(1));
            }
          }

          for (const dup of dupsToRevoke) {
            try {
              if (!dup.polar_subscription_id) {
                errorDetails.push({
                  id: dup.id,
                  error: 'Dedup: missing polar_subscription_id',
                });
                errors++;
                continue;
              }

              await delay(POLAR_API_DELAY_MS);
              await polar.subscriptions.revoke({
                id: dup.polar_subscription_id,
              });
              duplicatesRevoked++;
            } catch (err) {
              errors++;
              errorDetails.push({
                id: dup.id,
                error: `Dedup revoke failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            }

            send({
              type: 'progress',
              current: processed,
              total: processed,
              polarSynced,
              skipped,
              duplicatesRevoked,
              errors,
            });
          }
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: 'dedup-unexpected',
          error: `Dedup failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    send({
      type: 'complete',
      total: processed,
      polarSynced,
      skipped,
      duplicatesRevoked,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${processed} Polar subs checked: ${polarSynced} synced to DB, ${skipped} already present, ${duplicatesRevoked} duplicates revoked. ${errors} errors.`,
    });
  });
}

export const maxDuration = 600; // 10 minutes
