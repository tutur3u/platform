import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { releaseCheckout } from '@/lib/inventory/commerce/checkouts';
import { canUpdateInventorySales } from '@/lib/inventory/permissions';

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
    serverLogger.error('Failed to release inventory checkout', error);
    return NextResponse.json(
      { message: 'Failed to release inventory checkout' },
      { status: 500 }
    );
  }
}
