import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function requireExternalAppRegistryAdmin(request: Request) {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    request,
    wsId: ROOT_WORKSPACE_ID,
  });
  const canManageExternalApps =
    permissions?.containsPermission('manage_workspace_secrets') ||
    permissions?.containsPermission('manage_workspace_roles') ||
    false;

  if (!canManageExternalApps) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sbAdmin: (await createAdminClient()) as TypedSupabaseClient,
    user,
  };
}
