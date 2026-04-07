import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';
import { canViewInventoryDashboard } from '@/lib/inventory/permissions';
import { isInventoryRealtimeEnabled } from '@/lib/inventory/realtime';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
  const permissions = await getPermissions({ wsId, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const enabled = await isInventoryRealtimeEnabled(wsId);
  return NextResponse.json({ enabled });
}
