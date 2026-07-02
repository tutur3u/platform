import { NextResponse } from 'next/server';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';

export async function authorizeInfrastructureInventoryRead(
  request: Request,
  rawWsId: string
): Promise<{ ok: true; wsId: string } | { ok: false; response: NextResponse }> {
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization;

  const { permissions, wsId } = authorization.value;
  if (
    !canViewInventoryCatalog(permissions) &&
    !canManageInventorySetup(permissions)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Insufficient permissions to view inventory' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, wsId };
}
