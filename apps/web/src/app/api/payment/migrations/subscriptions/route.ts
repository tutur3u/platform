import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import {
  createFreeSubscription,
  hasActiveSubscription,
} from '@/utils/subscription-helper';
import { createNDJSONStream, fetchAllRows, verifyAdminAccess } from '../helper';

export async function POST() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

  const { data: workspaces, error: wsError } = await fetchAllRows((from, to) =>
    sbAdmin
      .from('workspaces')
      .select('id, workspace_subscriptions!left(id, status)')
      .range(from, to)
  );

  if (wsError) {
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }

  return createNDJSONStream(async (send) => {
    const total = workspaces.length;
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();

    send({ type: 'start', total });

    for (let i = 0; i < workspaces.length; i++) {
      const workspace = workspaces[i]!;

      try {
        if (
          workspace.workspace_subscriptions.some(
            (sub) => sub.status === 'active'
          )
        ) {
          skipped++;
        } else {
          await getOrCreatePolarCustomer({
            polar,
            supabase: sbAdmin,
            wsId: workspace.id,
          });

          const subscription = await createFreeSubscription(
            polar,
            sbAdmin,
            workspace.id
          );

          if (!subscription) {
            // Check if subscription creation was skipped due to existing subscription
            const hasActive = await hasActiveSubscription(
              polar,
              sbAdmin,
              workspace.id
            );

            if (hasActive) {
              skipped++;
            } else {
              errors++;
              errorDetails.push({
                id: workspace.id,
                error: 'Failed to create free subscription',
              });
            }
          } else {
            created++;
          }
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: workspace.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        created,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      created,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${total} workspaces found, ${created} created, ${skipped} skipped, ${errors} errors`,
    });
  });
}
