import 'server-only';

import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';

export type InventoryWorkspaceAuthorization = {
  permissions: PermissionsResult;
  userId: string;
  wsId: string;
};

type AuthorizeInventoryWorkspaceOptions = {
  requireInventoryEnabled?: boolean;
};

export async function authorizeInventoryWorkspace(
  request: Request,
  rawWsId: string,
  options: AuthorizeInventoryWorkspaceOptions = {}
): Promise<
  | { ok: true; value: InventoryWorkspaceAuthorization }
  | { ok: false; response: NextResponse }
> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'inventory' },
  });

  if (!auth.ok) return { ok: false, response: auth.response };

  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  if (
    options.requireInventoryEnabled !== false &&
    !(await isInventoryEnabled(wsId))
  ) {
    return { ok: false, response: inventoryNotFoundResponse() };
  }

  const permissions = await getPermissions({ user: auth.user, wsId });
  if (!permissions) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }

  return {
    ok: true,
    value: {
      permissions,
      userId: auth.user.id,
      wsId,
    },
  };
}
