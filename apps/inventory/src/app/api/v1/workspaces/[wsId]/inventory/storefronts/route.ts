import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  createStorefront,
  listStorefronts,
} from '@tuturuuu/inventory-core/commerce/repository';
import {
  listQuerySchema,
  StorefrontStatusSchema,
  storefrontPayloadSchema,
} from '@tuturuuu/inventory-core/commerce/schemas';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  const parsed = listQuerySchema(StorefrontStatusSchema).safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = await listStorefronts(authorization.value.wsId, parsed.data);
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = storefrontPayloadSchema.parse(await request.json());
    const data = await createStorefront(authorization.value.wsId, payload);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to create inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to create inventory storefront' },
      { status: 500 }
    );
  }
}
