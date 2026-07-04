import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  deleteStorefront,
  getStorefront,
  updateStorefront,
} from '@tuturuuu/inventory-core/commerce/repository';
import { storefrontPatchSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ storefrontId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await getStorefront(authorization.value.wsId, storefrontId);

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to load inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to load inventory storefront' },
      { status: 500 }
    );
  }
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
    const before = await getStorefront(authorization.value.wsId, storefrontId);
    const data = await updateStorefront(
      authorization.value.wsId,
      storefrontId,
      payload
    );

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();
    const changedFields = before
      ? diffInventoryAuditFields(
          before as unknown as Record<string, unknown>,
          data as unknown as Record<string, unknown>
        )
      : Object.keys(payload);
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      after: data as unknown as Record<string, unknown>,
      before: before as unknown as Record<string, unknown>,
      changedFields,
      entityId: storefrontId,
      entityKind: 'storefront',
      entityLabel: data.name,
      eventKind: payload.status === 'archived' ? 'archived' : 'updated',
      summary:
        payload.status === 'archived'
          ? `Archived storefront ${data.name}`
          : `Updated storefront ${data.name}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront payload', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Failed to update inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to update inventory storefront' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const before = await getStorefront(authorization.value.wsId, storefrontId);
    const deleted = await deleteStorefront(
      authorization.value.wsId,
      storefrontId
    );

    if (!deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      before: before as unknown as Record<string, unknown>,
      entityId: storefrontId,
      entityKind: 'storefront',
      entityLabel: before?.name ?? null,
      eventKind: 'deleted',
      summary: `Deleted storefront ${before?.name ?? storefrontId}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory storefront' },
      { status: 500 }
    );
  }
}
