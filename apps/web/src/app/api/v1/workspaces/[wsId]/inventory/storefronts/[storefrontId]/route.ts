import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { updateStorefront } from '@/lib/inventory/commerce/repository';
import { storefrontPatchSchema } from '@/lib/inventory/commerce/schemas';
import { canManageInventorySetup } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ storefrontId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = storefrontPatchSchema.parse(await request.json());
    const data = await updateStorefront(
      authorization.value.wsId,
      storefrontId,
      payload
    );

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to update inventory storefront' },
      { status: 500 }
    );
  }
}
