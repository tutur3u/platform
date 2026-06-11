import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  deleteBundle,
  InvalidInventoryBundleComponentTargetError,
  updateBundle,
} from '@/lib/inventory/commerce/bundles';
import { bundlePatchSchema } from '@/lib/inventory/commerce/schemas';
import { canManageInventoryCatalog } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ bundleId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { bundleId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = bundlePatchSchema.parse(await request.json());
    const data = await updateBundle(
      authorization.value.wsId,
      bundleId,
      payload
    );

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid inventory bundle payload', errors: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof InvalidInventoryBundleComponentTargetError) {
      return NextResponse.json(
        { message: 'Invalid inventory bundle component target' },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update inventory bundle', error);
    return NextResponse.json(
      { message: 'Failed to update inventory bundle' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { bundleId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteBundle(authorization.value.wsId, bundleId);

    if (!deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    serverLogger.error('Failed to delete inventory bundle', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory bundle' },
      { status: 500 }
    );
  }
}
