import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { squareTerminalCheckoutPayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { createInventorySquareTerminalCheckout } from '@tuturuuu/inventory-core/commerce/square';
import { canUpdateInventorySales } from '@tuturuuu/inventory-core/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canUpdateInventorySales(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = squareTerminalCheckoutPayloadSchema.parse(
      await request.json()
    );
    const result = await createInventorySquareTerminalCheckout({
      checkoutId: payload.checkoutId,
      deviceId: payload.deviceId,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data: result.checkout }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: 'Invalid Square terminal checkout payload',
          errors: error.issues,
        },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to create Square terminal checkout', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create Square terminal checkout',
      },
      { status: 500 }
    );
  }
}
