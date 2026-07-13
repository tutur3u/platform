import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  getInventorySquareSyncState,
  syncInventorySquareCatalog,
} from '@tuturuuu/inventory-core/commerce/square';
import {
  canAdjustInventoryStock,
  canManageInventoryCatalog,
  canManageInventorySetup,
} from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

const syncSchema = z.object({
  direction: z.enum(['from_square', 'to_square', 'bidirectional']),
});

function canSync(permissions: Parameters<typeof canManageInventorySetup>[0]) {
  return (
    canManageInventorySetup(permissions) ||
    (canManageInventoryCatalog(permissions) &&
      canAdjustInventoryStock(permissions))
  );
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canSync(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      await getInventorySquareSyncState(authorization.value.wsId)
    );
  } catch (error) {
    console.error('Failed to load inventory Square sync state', error);
    return NextResponse.json(
      { message: 'Failed to load Square sync state' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canSync(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    const { direction } = syncSchema.parse(await request.json());
    return NextResponse.json(
      await syncInventorySquareCatalog({
        direction,
        userId: authorization.value.userId,
        wsId: authorization.value.wsId,
      })
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { errors: error.issues, message: 'Invalid Square sync direction' },
        { status: 400 }
      );
    }
    console.error('Failed to sync inventory with Square', error);
    const message =
      error instanceof Error &&
      (error.message.startsWith('Reconnect Square') ||
        error.message.startsWith('Select a Square location'))
        ? error.message
        : 'Failed to sync inventory with Square';
    return NextResponse.json({ message }, { status: 500 });
  }
}
