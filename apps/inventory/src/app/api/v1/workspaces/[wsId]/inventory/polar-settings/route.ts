import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  getInventoryPolarSettings,
  saveInventoryPolarSettings,
} from '@tuturuuu/inventory-core/commerce/polar';
import { polarSettingsPayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const settings = await getInventoryPolarSettings(authorization.value.wsId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to load inventory Polar settings', error);
    return NextResponse.json(
      { message: 'Failed to load Polar settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = polarSettingsPayloadSchema.parse(await request.json());
    const settings = await saveInventoryPolarSettings({
      payload,
      userId: authorization.value.userId,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid Polar settings payload', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Failed to save inventory Polar settings', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save Polar settings',
      },
      { status: 500 }
    );
  }
}
