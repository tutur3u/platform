import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { resolveUserGroupAppSessionUser } from './route-auth';

export async function resolveUserGroupRouteWorkspaceId(
  wsId: string,
  request?: Request
) {
  if (wsId.toLowerCase() !== PERSONAL_WORKSPACE_SLUG) {
    return resolveWorkspaceId(wsId);
  }

  const { normalizeWorkspaceId } = await import(
    '@tuturuuu/utils/workspace-helper'
  );
  return normalizeWorkspaceId(wsId, undefined, request as NextRequest);
}

export async function resolveRequestActorAuthUid(request: Request) {
  const appSessionUser = resolveUserGroupAppSessionUser(request);
  if (appSessionUser) return appSessionUser.id;

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

export async function hasUserGroupPostInWorkspace({
  sbAdmin,
  wsId,
  groupId,
  postId,
}: {
  groupId: string;
  postId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select(`
      id,
      group_id,
      workspace_user_groups!inner(ws_id)
    `)
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}
