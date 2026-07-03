import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { backfillProductListings } from '@tuturuuu/inventory-core/commerce/auto-listing';
import {
  getInventoryPolarProductSyncSummary,
  reconcileWorkspacePolarProducts,
} from '@tuturuuu/inventory-core/commerce/polar-product-sync';
import {
  canManageInventorySetup,
  canViewInventoryDashboard,
} from '@tuturuuu/inventory-core/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * Returns the workspace's Polar product sync health (counts by status + recent
 * errors) for the Polar hub sync-health card.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryDashboard(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const summary = await getInventoryPolarProductSyncSummary(
      authorization.value.wsId
    );
    return NextResponse.json(summary);
  } catch (error) {
    serverLogger.error('Failed to load inventory Polar sync summary', error);
    return NextResponse.json(
      { message: 'Failed to load Polar sync summary' },
      { status: 500 }
    );
  }
}

/**
 * Forces a full push of the workspace's inventory listings/bundles into Polar.
 * Useful after connecting Polar, or to re-converge rows that errored mid-sync.
 * The Polar -> inventory direction is handled by the product webhook handlers.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Surface any products that aren't listed yet so they become sellable and
    // sync to Polar through the listing path, then reconcile every listing.
    const listed = await backfillProductListings(authorization.value.wsId);
    const result = await reconcileWorkspacePolarProducts(
      authorization.value.wsId
    );

    return NextResponse.json({ ok: true, synced: { ...result, listed } });
  } catch (error) {
    serverLogger.error('Failed to sync inventory products to Polar', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to sync inventory products to Polar',
      },
      { status: 500 }
    );
  }
}
