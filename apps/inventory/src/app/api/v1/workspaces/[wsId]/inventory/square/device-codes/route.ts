import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { squareDeviceCodePayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { createInventorySquareDeviceCode } from '@tuturuuu/inventory-core/commerce/square';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = squareDeviceCodePayloadSchema.parse(await request.json());
    const data = await createInventorySquareDeviceCode({
      locationId: payload.locationId,
      name: payload.name,
      userId: authorization.value.userId,
      wsId: authorization.value.wsId,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid Square device code payload', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Failed to create Square device code', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create Square device code',
      },
      { status: 500 }
    );
  }
}
