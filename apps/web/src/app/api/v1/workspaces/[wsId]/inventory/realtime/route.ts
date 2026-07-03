import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventoryDashboard } from '@tuturuuu/inventory-core/permissions';
import { isInventoryRealtimeEnabled } from '@tuturuuu/inventory-core/realtime';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const authorization = await authorizeInventoryWorkspace(req, wsId);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId: normalizedWsId } = authorization.value;

  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const enabled = await isInventoryRealtimeEnabled(normalizedWsId);
  return NextResponse.json({ enabled });
}
