import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { listInventorySquareDevices } from '@/lib/inventory/commerce/square';
import { canManageInventorySetup } from '@/lib/inventory/permissions';

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

    const data = await listInventorySquareDevices(authorization.value.wsId);
    return NextResponse.json({ data });
  } catch (error) {
    serverLogger.error('Failed to list Square devices', error);
    return NextResponse.json(
      { message: 'Failed to list Square devices' },
      { status: 500 }
    );
  }
}
