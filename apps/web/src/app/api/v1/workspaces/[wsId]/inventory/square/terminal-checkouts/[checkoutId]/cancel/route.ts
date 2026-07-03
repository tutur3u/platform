import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { cancelInventorySquareTerminalCheckout } from '@tuturuuu/inventory-core/commerce/square';
import { canUpdateInventorySales } from '@tuturuuu/inventory-core/permissions';

interface Params {
  params: Promise<{ checkoutId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { checkoutId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canUpdateInventorySales(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await cancelInventorySquareTerminalCheckout({
      checkoutId,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    serverLogger.error('Failed to cancel Square terminal checkout', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to cancel Square terminal checkout',
      },
      { status: 500 }
    );
  }
}
