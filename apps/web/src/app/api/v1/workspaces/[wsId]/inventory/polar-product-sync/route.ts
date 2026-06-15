import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { reconcileWorkspacePolarProducts } from '@/lib/inventory/commerce/polar-product-sync';
import { canManageInventorySetup } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
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

    const result = await reconcileWorkspacePolarProducts(
      authorization.value.wsId
    );

    return NextResponse.json({ ok: true, synced: result });
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
