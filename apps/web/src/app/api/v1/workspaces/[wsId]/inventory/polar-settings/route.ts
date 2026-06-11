import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  getInventoryPolarSettings,
  saveInventoryPolarSettings,
} from '@/lib/inventory/commerce/polar';
import { polarSettingsPayloadSchema } from '@/lib/inventory/commerce/schemas';
import {
  canManageInventorySetup,
  canViewInventoryDashboard,
} from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryDashboard(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const settings = await getInventoryPolarSettings(authorization.value.wsId);
    return NextResponse.json(settings);
  } catch (error) {
    serverLogger.error('Failed to load inventory Polar settings', error);
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

    serverLogger.error('Failed to save inventory Polar settings', error);
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
