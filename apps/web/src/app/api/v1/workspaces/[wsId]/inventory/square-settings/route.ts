import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { squareSettingsPayloadSchema } from '@/lib/inventory/commerce/schemas';
import {
  getInventorySquareSettings,
  saveInventorySquareSettings,
} from '@/lib/inventory/commerce/square';
import { canManageInventorySetup } from '@/lib/inventory/permissions';

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

    const settings = await getInventorySquareSettings(authorization.value.wsId);
    return NextResponse.json(settings);
  } catch (error) {
    serverLogger.error('Failed to load inventory Square settings', error);
    return NextResponse.json(
      { message: 'Failed to load Square settings' },
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

    const payload = squareSettingsPayloadSchema.parse(await request.json());
    const settings = await saveInventorySquareSettings({
      payload,
      userId: authorization.value.userId,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid Square settings payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to save inventory Square settings', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save Square settings',
      },
      { status: 500 }
    );
  }
}
