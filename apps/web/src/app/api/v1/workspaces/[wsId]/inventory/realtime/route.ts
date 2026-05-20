import { NextResponse } from 'next/server';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { canViewInventoryDashboard } from '@/lib/inventory/permissions';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

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
