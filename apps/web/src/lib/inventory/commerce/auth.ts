import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';

export type InventoryWorkspaceAuthorization = {
  permissions: PermissionsResult;
  userId: string;
  wsId: string;
};

export async function authorizeInventoryWorkspace(
  request: Request,
  rawWsId: string
): Promise<
  | { ok: true; value: InventoryWorkspaceAuthorization }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    supabase,
    userId: user.id,
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

  if (!(await isInventoryEnabled(wsId))) {
    return { ok: false, response: inventoryNotFoundResponse() };
  }

  const permissions = await getPermissions({ request, wsId });
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
      userId: user.id,
      wsId,
    },
  };
}
