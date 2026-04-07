import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
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
  const permissions = await getPermissions({ wsId, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventoryDashboard(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient(req);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  if (!(await isInventoryEnabled(normalizedWsId))) {
    return inventoryNotFoundResponse();
  }

  const enabled = await isInventoryRealtimeEnabled(normalizedWsId);
  return NextResponse.json({ enabled });
}
