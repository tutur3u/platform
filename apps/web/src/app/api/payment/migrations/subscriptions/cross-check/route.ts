import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { syncSubscriptionToDatabase } from '@/app/api/payment/webhooks/route';
import {
  createFreeSubscription,
  hasActiveSubscription,
} from '@/utils/subscription-helper';
import {
  createNDJSONStream,
  fetchAllRows,
  upsertSubscriptionError,
  verifyAdminAccess,
} from '../../helper';

const POLAR_API_DELAY_MS = 100;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

  // Pre-fetch all active DB subscriptions
  const { data: dbSubscriptions, error: dbError } = await fetchAllRows(
    (from, to) =>
      sbAdmin
        .from('workspace_subscriptions')
        .select('*')
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

  return createNDJSONStream(async (send) => {
    let synced = 0; // DB rows corrected to match Polar
    let skipped = 0; // Already in sync
    let polarSynced = 0; // Missing Polar subs synced to DB
    let freeCreated = 0; // Free subs created for affected workspaces
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const affectedWsIds = new Set<string>();
    const startTime = Date.now();

    // Build a set of known polar_subscription_ids for Phase 2 lookup
    const dbPolarIds = new Set(
      dbSubscriptions.map((s) => s.polar_subscription_id)
    );

    // Total = Phase 1 items (we'll update total when Phase 2 starts)
    const phase1Total = dbSubscriptions.length;
    send({ type: 'start', total: phase1Total });

    // ─── Phase 1: DB → Polar (verify active DB subs) ───
    for (let i = 0; i < dbSubscriptions.length; i++) {
      const sub = dbSubscriptions[i]!;

      try {
        await delay(POLAR_API_DELAY_MS);

        const polarSub = await polar.subscriptions.get({
          id: sub.polar_subscription_id,
        });

        if (polarSub.status !== 'active') {
          // DB says active but Polar disagrees — update DB to match
          const { error: updateError } = await sbAdmin
            .from('workspace_subscriptions')
            .update({ status: polarSub.status as any })
            .eq('polar_subscription_id', sub.polar_subscription_id);

          if (updateError) {
            errors++;
            errorDetails.push({
              id: sub.polar_subscription_id,
              error: `DB update failed: ${updateError.message}`,
            });
          } else {
            synced++;
            affectedWsIds.add(sub.ws_id);
          }
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: sub.polar_subscription_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      send({
        type: 'progress',
        phase: 'db_to_polar',
        current: i + 1,
        total: phase1Total,
        synced,
        skipped,
        polarSynced,
        freeCreated,
        errors,
      });
    }

    // ─── Phase 2: Polar → DB (sync missing subscriptions) ───
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
          if (!dbPolarIds.has(polarSub.id)) {
            // This Polar subscription is missing from DB — sync it
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
          }
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

    // ─── Phase 3: Free subscription fallback ───
    for (const wsId of affectedWsIds) {
      try {
        await delay(POLAR_API_DELAY_MS);

        const { hasWorkspace, hasActive } = await hasActiveSubscription(
          polar,
          sbAdmin,
          wsId
        );

        if (!hasWorkspace) continue;

        if (!hasActive) {
          const result = await createFreeSubscription(polar, sbAdmin, wsId);

          if (result.status === 'created') {
            freeCreated++;
          } else if (result.status === 'error') {
            await upsertSubscriptionError(
              sbAdmin,
              wsId,
              result.message,
              'cross_check'
            );

            errors++;
            errorDetails.push({
              id: wsId,
              error: `Free sub creation failed: ${result.message}`,
            });
          }
          // already_active is fine, no action needed
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: wsId,
          error: `Fallback failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const total = phase1Total;

    send({
      type: 'complete',
      total,
      synced,
      skipped,
      polarSynced,
      freeCreated,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `Phase 1: ${phase1Total} DB subs checked (${synced} corrected, ${skipped} in sync). Phase 2: ${polarSynced} missing Polar subs synced to DB. Phase 3: ${freeCreated} free subs created. ${errors} errors.`,
    });
  });
}

export const maxDuration = 600; // 10 minutes
