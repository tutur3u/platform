import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import { createInventoryAuditLog } from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  deleteStorefrontListing,
  updateStorefrontListing,
} from '@tuturuuu/inventory-core/commerce/repository';
import { storefrontListingPayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { canManageInventoryCatalog } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const storefrontListingPatchSchema = storefrontListingPayloadSchema.partial();

interface Params {
  params: Promise<{ listingId: string; storefrontId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { listingId, storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = storefrontListingPatchSchema.parse(await request.json());
    const data = await updateStorefrontListing(
      authorization.value.wsId,
      storefrontId,
      listingId,
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
      entityId: listingId,
      entityKind: 'storefront_listing',
      entityLabel: data.title,
      eventKind: payload.status === 'archived' ? 'archived' : 'updated',
      summary:
        payload.status === 'archived'
          ? `Archived storefront listing ${data.title}`
          : `Updated storefront listing ${data.title}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront listing payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update inventory storefront listing', error);
    return NextResponse.json(
      { message: 'Failed to update inventory storefront listing' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { listingId, storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteStorefrontListing(
      authorization.value.wsId,
      storefrontId,
      listingId
    );

    if (!deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      entityId: listingId,
      entityKind: 'storefront_listing',
      eventKind: 'deleted',
      summary: `Deleted storefront listing ${listingId}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    serverLogger.error('Failed to delete inventory storefront listing', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory storefront listing' },
      { status: 500 }
    );
  }
}
