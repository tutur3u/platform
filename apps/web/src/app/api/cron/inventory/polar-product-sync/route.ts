import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { reconcileWorkspacePolarProducts } from '@/lib/inventory/commerce/polar-product-sync';

/**
 * Drift-repair cron for the inventory <-> Polar product catalog. Re-pushes every
 * non-archived listing/bundle for each workspace that has a Polar integration,
 * converging rows that were created before Polar was connected or errored
 * mid-sync. The reverse direction (Polar -> inventory) is event-driven via the
 * product webhook handlers, so this only needs to handle the push side.
 */
export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'inventory-polar-product-sync',
      path: '/api/cron/inventory/polar-product-sync',
      request: req,
    },
    () => handleGET(req)
  );
}

async function handleGET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

    if (!DEV_MODE && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const { data: integrations, error } = (await sbAdmin
      .schema('private')
      .from('inventory_polar_integrations' as never)
      .select('ws_id')) as {
      data: Array<{ ws_id: string }> | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new Error(error.message ?? 'Failed to list Polar integrations');
    }

    const wsIds = Array.from(
      new Set((integrations ?? []).map((row) => row.ws_id))
    );

    let listings = 0;
    let bundles = 0;
    const failed: string[] = [];

    for (const wsId of wsIds) {
      try {
        const result = await reconcileWorkspacePolarProducts(wsId);
        listings += result.listings;
        bundles += result.bundles;
      } catch (workspaceError) {
        failed.push(wsId);
        serverLogger.error('Inventory Polar product cron sync failed', {
          error:
            workspaceError instanceof Error
              ? workspaceError.message
              : 'Unknown error',
          wsId,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: { bundles, listings, workspaces: wsIds.length },
      failed,
    });
  } catch (error) {
    serverLogger.error('Inventory Polar product cron failed', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
