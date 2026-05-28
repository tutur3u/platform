import { NextResponse } from 'next/server';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canManageInventorySetup,
  canViewInventoryAnalytics,
  canViewInventoryAuditLogs,
  canViewInventoryCatalog,
  canViewInventoryDashboard,
  canViewInventorySales,
  canViewInventoryStock,
} from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id, {
    requireInventoryEnabled: false,
  });

  if (!authorization.ok) return authorization.response;

  const { permissions } = authorization.value;

  return NextResponse.json({
    enabled:
      canViewInventoryDashboard(permissions) ||
      canViewInventoryCatalog(permissions) ||
      canManageInventorySetup(permissions) ||
      canViewInventoryStock(permissions) ||
      canViewInventorySales(permissions) ||
      canViewInventoryAnalytics(permissions) ||
      canViewInventoryAuditLogs(permissions),
  });
}
