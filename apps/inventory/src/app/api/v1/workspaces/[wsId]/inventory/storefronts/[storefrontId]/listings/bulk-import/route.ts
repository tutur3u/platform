import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  bulkCreateStorefrontListingsFromStock,
  getStorefront,
} from '@tuturuuu/inventory-core/commerce/repository';
import { canManageInventoryCatalog } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ storefrontId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { storefrontId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;
  if (!canManageInventoryCatalog(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { wsId } = authorization.value;
    const storefront = await getStorefront(wsId, storefrontId);
    if (!storefront) {
      return NextResponse.json(
        { message: 'Storefront not found' },
        { status: 404 }
      );
    }
    const data = await bulkCreateStorefrontListingsFromStock(
      wsId,
      storefrontId,
      storefront.currency
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Failed to bulk import inventory storefront listings', error);
    return NextResponse.json(
      { message: 'Failed to import storefront listings' },
      { status: 500 }
    );
  }
}
