import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
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

const PERSONAL_WORKSPACE_ALIAS = 'personal';

async function normalizeInventoryWorkspaceId({
  rawWsId,
  supabase,
  userId,
}: {
  rawWsId: string;
  supabase: Parameters<typeof normalizeWorkspaceId>[1];
  userId: string;
}) {
  if (rawWsId.trim().toLowerCase() !== PERSONAL_WORKSPACE_ALIAS) {
    return normalizeWorkspaceId(rawWsId, supabase);
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: workspace, error } = await sbAdmin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id, type)')
    .eq('personal', true)
    .eq('workspace_members.user_id', userId)
    .eq('workspace_members.type', 'MEMBER')
    .maybeSingle();

  if (error || !workspace?.id) {
    throw new Error('Personal workspace not found');
  }

  return workspace.id;
}

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
    wsId = await normalizeInventoryWorkspaceId({
      rawWsId,
      supabase: auth.supabase,
      userId: auth.user.id,
    });
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
