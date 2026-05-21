import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function resolveUserGroupRouteWorkspaceId(
  wsId: string,
  request?: Request
) {
  return normalizeWorkspaceId(wsId, undefined, request as NextRequest);
}

export async function resolveRequestActorAuthUid(request: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return user?.id ?? null;
}

export async function hasUserGroupInWorkspace({
  sbAdmin,
  wsId,
  groupId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  groupId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}
