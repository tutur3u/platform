import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  createNDJSONStream,
  fetchAllRows,
  verifyAdminAccess,
} from '../../helper';

export async function DELETE() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();

  const { data: subscriptions, error: subError } = await fetchAllRows(
    (from, to) =>
      sbAdmin
        .from('workspace_subscriptions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, to)
  );

  if (subError) {
    return NextResponse.json(
      {
        error: `Failed to fetch subscriptions: ${subError instanceof Error ? subError.message : String(subError)}`,
      },
      { status: 500 }
    );
  }

  // Group subscriptions by workspace, keeping order (latest first)
  const byWorkspace = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    const existing = byWorkspace.get(sub.ws_id);
    if (existing) {
      existing.push(sub);
    } else {
      byWorkspace.set(sub.ws_id, [sub]);
    }
  }

  // Collect only old (non-latest) subscriptions from workspaces with duplicates
  const subsToRevoke: typeof subscriptions = [];
  let kept = 0;
  let skipped = 0;

  for (const [, wsSubs] of byWorkspace) {
    if (wsSubs.length <= 1) {
      // Only one active subscription — skip entirely
      skipped++;
      continue;
    }
    // First element is the latest (sorted desc) — keep it, revoke the rest
    kept++;
    subsToRevoke.push(...wsSubs.slice(1));
  }

  return createNDJSONStream(async (send) => {
    const total = subsToRevoke.length;
    let processed = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();
    const polar = createPolarClient();

    send({ type: 'start', total, kept, skipped });

    for (let i = 0; i < subsToRevoke.length; i++) {
      const sub = subsToRevoke[i]!;

      try {
        if (!sub.polar_subscription_id) {
          errorDetails.push({
            id: sub.id,
            error: 'Missing polar_subscription_id',
          });
          errors++;
          continue;
        }

        await polar.subscriptions.revoke({
          id: sub.polar_subscription_id,
        });
        processed++;
      } catch (err) {
        errors++;
        errorDetails.push({
          id: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        processed,
        kept,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      processed,
      kept,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${byWorkspace.size} workspaces scanned, ${kept} had duplicates (latest kept), ${processed} old subscriptions revoked, ${skipped} single-subscription workspaces skipped, ${errors} errors`,
    });
  });
}
