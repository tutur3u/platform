import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  createInventoryProductResponse,
  InventoryProductCreateSchema,
} from '@tuturuuu/inventory-core/product-create';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const ProductCreateSchema = InventoryProductCreateSchema;

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const sbAdmin = await createAdminClient();

  const parsed = InventoryProductCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;
  const { permissions, userId, wsId } = authorization.value;

  return createInventoryProductResponse({
    actorAuthUserId: userId,
    payload: parsed.data,
    permissions,
    sbAdmin,
    wsId,
  });
}
