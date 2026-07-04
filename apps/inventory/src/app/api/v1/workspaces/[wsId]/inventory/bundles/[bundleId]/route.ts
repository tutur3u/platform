import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import { createInventoryAuditLog } from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  deleteBundle,
  InvalidInventoryBundleComponentTargetError,
  updateBundle,
} from '@tuturuuu/inventory-core/commerce/bundles';
import { bundlePatchSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { canManageInventoryCatalog } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

    const sbAdmin = await createAdminClient();
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      after: data as unknown as Record<string, unknown>,
      changedFields: Object.keys(payload),
      entityId: bundleId,
      entityKind: 'bundle',
      entityLabel: data.name,
      eventKind: payload.status === 'archived' ? 'archived' : 'updated',
      summary:
        payload.status === 'archived'
          ? `Archived bundle ${data.name}`
          : `Updated bundle ${data.name}`,
      wsId: authorization.value.wsId,
    });

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

    console.error('Failed to update inventory bundle', error);
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

    const sbAdmin = await createAdminClient();
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      entityId: bundleId,
      entityKind: 'bundle',
      eventKind: 'deleted',
      summary: `Deleted bundle ${bundleId}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete inventory bundle', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory bundle' },
      { status: 500 }
    );
  }
}
