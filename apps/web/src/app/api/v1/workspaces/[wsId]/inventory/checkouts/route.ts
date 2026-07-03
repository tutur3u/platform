import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { listCheckouts } from '@tuturuuu/inventory-core/commerce/checkouts';
import {
  CheckoutStatusSchema,
  listQuerySchema,
} from '@tuturuuu/inventory-core/commerce/schemas';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  if (!canViewInventorySales(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = listQuerySchema(CheckoutStatusSchema).safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = await listCheckouts(authorization.value.wsId, parsed.data);
  return NextResponse.json(data);
}
