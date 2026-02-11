import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
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
 * Phase 1: DB → Polar verification.
 * Checks every active DB subscription against the Polar API.
 * If Polar reports a subscription is no longer active, updates the DB status.
 * Returns `affectedWsIds` in the completion event for Phase 3.
 */
export async function POST() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

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
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const affectedWsIds = new Set<string>();
    const startTime = Date.now();
    const total = dbSubscriptions.length;

    send({ type: 'start', total });

    for (let i = 0; i < dbSubscriptions.length; i++) {
      const sub = dbSubscriptions[i]!;

      try {
        await delay(POLAR_API_DELAY_MS);

        const polarSub = await polar.subscriptions.get({
          id: sub.polar_subscription_id,
        });

        if (polarSub.status !== 'active') {
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
        current: i + 1,
        total,
        synced,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      synced,
      skipped,
      errors,
      affectedWsIds: [...affectedWsIds],
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${total} DB subs checked: ${synced} corrected, ${skipped} in sync. ${errors} errors. ${affectedWsIds.size} workspace(s) affected.`,
    });
  });
}

export const maxDuration = 600; // 10 minutes
