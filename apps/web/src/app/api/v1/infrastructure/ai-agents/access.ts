import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export async function requireAiAgentAdmin(request: NextRequest) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'chat' },
  });

  if (!auth.ok) {
    return auth;
  }

  const permissions = await getPermissions({
    user: auth.user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (permissions.withoutPermission('manage_workspace_secrets')) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sbAdmin: (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient,
    user: auth.user,
  };
}
