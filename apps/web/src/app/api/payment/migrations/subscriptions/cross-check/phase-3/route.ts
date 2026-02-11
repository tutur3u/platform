import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createFreeSubscription,
  hasActiveSubscription,
} from '@/utils/subscription-helper';
import {
  createNDJSONStream,
  upsertSubscriptionError,
  verifyAdminAccess,
} from '../../../helper';

const POLAR_API_DELAY_MS = 100;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bodySchema = z.object({
  wsIds: z.array(z.string().uuid()).min(1),
});

/**
 * Phase 3: Free subscription fallback.
 * Accepts a list of workspace IDs (typically from Phase 1's `affectedWsIds`)
 * and creates free subscriptions for those that no longer have an active sub.
 */
export async function POST(request: Request) {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { wsIds } = parsed.data;
  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

  return createNDJSONStream(async (send) => {
    let freeCreated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();
    const total = wsIds.length;

    send({ type: 'start', total });

    for (let i = 0; i < wsIds.length; i++) {
      const wsId = wsIds[i]!;

      try {
        await delay(POLAR_API_DELAY_MS);

        const { hasWorkspace, hasActive } = await hasActiveSubscription(
          polar,
          sbAdmin,
          wsId
        );

        if (!hasWorkspace) {
          skipped++;
        } else if (!hasActive) {
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
          } else {
            // already_active
            skipped++;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: wsId,
          error: `Fallback failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        freeCreated,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      freeCreated,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${total} workspaces checked: ${freeCreated} free subs created, ${skipped} skipped. ${errors} errors.`,
    });
  });
}

export const maxDuration = 600; // 10 minutes
