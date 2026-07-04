import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { releaseCheckout } from '@tuturuuu/inventory-core/commerce/checkouts';
import { canUpdateInventorySales } from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ checkoutId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { checkoutId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canUpdateInventorySales(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await releaseCheckout(authorization.value.wsId, checkoutId);

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to release inventory checkout', error);
    return NextResponse.json(
      { message: 'Failed to release inventory checkout' },
      { status: 500 }
    );
  }
}
