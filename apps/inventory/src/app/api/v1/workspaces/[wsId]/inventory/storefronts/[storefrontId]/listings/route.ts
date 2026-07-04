import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  createStorefrontListing,
  listStorefrontListings,
} from '@tuturuuu/inventory-core/commerce/repository';
import {
  ListingStatusSchema,
  storefrontListingPayloadSchema,
} from '@tuturuuu/inventory-core/commerce/schemas';
import {
  canManageInventoryCatalog,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ storefrontId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { storefrontId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  if (!canViewInventoryCatalog(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = z
    .object({
      status: z.union([ListingStatusSchema, z.literal('all')]).optional(),
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = await listStorefrontListings(
    authorization.value.wsId,
    storefrontId,
    parsed.data
  );
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = storefrontListingPayloadSchema.parse(await request.json());
    const data = await createStorefrontListing(
      authorization.value.wsId,
      storefrontId,
      payload
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront listing payload', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Failed to create inventory storefront listing', error);
    return NextResponse.json(
      { message: 'Failed to create inventory storefront listing' },
      { status: 500 }
    );
  }
}
