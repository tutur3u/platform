import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { listInventorySquareLocations } from '@tuturuuu/inventory-core/commerce/square';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;
    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await listInventorySquareLocations(authorization.value.wsId);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to list Square locations', error);
    return NextResponse.json(
      { message: 'Failed to list Square locations' },
      { status: 500 }
    );
  }
}
