import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  deleteStorefrontListing,
  updateStorefrontListing,
} from '@/lib/inventory/commerce/repository';
import { storefrontListingPayloadSchema } from '@/lib/inventory/commerce/schemas';
import { canManageInventoryCatalog } from '@/lib/inventory/permissions';

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    serverLogger.error('Failed to delete inventory storefront listing', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory storefront listing' },
      { status: 500 }
    );
  }
}
